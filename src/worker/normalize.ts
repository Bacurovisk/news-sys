import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid"]);

/**
 * Desembrulha redirecionadores de clique no formato ".../*https://destino"
 * (ex.: redir.folha.com.br/redir/online/poder/rss091/*https://www1.folha.uol.com.br/...).
 */
export function unwrapRedirect(raw: string): string {
  const m = /^https?:\/\/[^/]+\/[^*]*\*(https?:\/\/.+)$/i.exec(raw.trim());
  return m ? m[1] : raw.trim();
}

/** URL canônica (http/https, sem fragmento e sem parâmetros de rastreamento) ou null. */
export function canonicalUrl(raw: string | undefined | null, base?: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(unwrapRedirect(raw), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || TRACKING_PARAMS.has(k)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export function urlHash(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

/** Converte HTML/entidades em texto puro com espaços normalizados. */
export function htmlToText(input: string | undefined | null): string {
  if (!input) return "";
  // Atalho: sem tags nem entidades não há o que decodificar.
  if (!/[<&]/.test(input)) return input.replace(/\s+/g, " ").trim();
  const $ = cheerio.load(input, null, false);
  $("script, style, noscript, iframe, figure figcaption").remove();
  $("br, p, div, li, h1, h2, h3, h4").before(" ").after(" ");
  let text = $.root().text();
  // Feeds às vezes escapam HTML duas vezes (&amp;quot;, &lt;p&gt;): segunda passada.
  if (/&(#\d+|#x[\da-f]+|[a-z]+);|<[a-z!/]/i.test(text)) {
    const $$ = cheerio.load(text, null, false);
    $$("script, style, noscript, iframe").remove();
    text = $$.root().text();
  }
  return text.replace(/\s+/g, " ").trim();
}

const BOILERPLATE = [
  /\s*The post .+ appeared first on .+\.?$/i,
  /\s*O post .+ apareceu primeiro em .+\.?$/i,
  /\s*The post .+ first appeared on .+\.?$/i,
  /\s*(Continue|Continuar) (lendo|a ler).*$/i,
  /\s*(Leia|Veja) (mais|também|tambem)\s*(\.{3}|…|»)?$/i,
  /\s*\[(…|\.\.\.)\]\s*$/,
];

export function cleanSummary(text: string): string {
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, "");
  return out.trim();
}

/**
 * g1: a description é `<img><br>` + legenda da foto + crédito + texto, uma linha cada.
 * Remove legenda e crédito quando a segunda linha tem cara de crédito (curta, sem ponto final,
 * ex.: "Reprodução/Instagram", "Jefferson Rudy/Agência Senado").
 */
export function stripImageCaption(html: string | undefined | null): string {
  if (!html) return "";
  const m = /^\s*<img[^>]*>\s*<br\s*\/?>/i.exec(html);
  if (!m) return html;
  const lines = html.slice(m[0].length).split("\n").map((l) => l.trim()).filter(Boolean);
  const credit = lines[1] ?? "";
  const looksLikeCredit =
    lines.length >= 3 && credit.length <= 60 && (!/[.!?:;]$/.test(credit) || /\/|reprodu|divulga|foto/i.test(credit));
  return looksLikeCredit ? lines.slice(2).join("\n").replace(/^[\s.,;:\-–—]+/u, "") : html;
}

const wordKey = (w: string) => unaccentLower(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Tira do começo do resumo a repetição do título (ex.: CN7 e g1 começam a description pela
 * manchete), inteira ou encurtada (6+ palavras), e o nome do veículo grudado logo depois.
 * Só corta quando o resto começa frase nova (maiúscula, número ou aspas).
 */
export function stripRepeatedTitle(summary: string, title: string, sourceName = ""): string {
  const words = summary.split(" ");
  const titleKeys = title.split(" ").map(wordKey).filter(Boolean);
  let m = 0;
  while (m < words.length && m < titleKeys.length && wordKey(words[m]) === titleKeys[m]) m++;
  if (m < titleKeys.length && m < 6) return summary;

  let rest = words.slice(m);
  // Só é repetição se o que sobra começa frase nova; "…, foi anunciada" é a própria frase continuando.
  if (rest.length && !/^[\p{Lu}\p{N}"“'(]/u.test(rest[0])) return summary;
  const nameKeys = sourceName.split(" ").map(wordKey).filter(Boolean);
  if (nameKeys.length && nameKeys.every((k, i) => rest[i] !== undefined && wordKey(rest[i]) === k)) {
    rest = rest.slice(nameKeys.length);
  }
  return rest.join(" ").replace(/^[\s\-–—:|.,;]+/u, "");
}

/** Corta em limite de palavra, com reticências, sem passar de max caracteres. */
export function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  const base = cut > max * 0.6 ? slice.slice(0, cut) : slice;
  return base.replace(/[\s,;:.\-–—(]+$/u, "") + "…";
}

// "Chapéu" no lugar do título: UOL manda <title>AO VIVO</title> ou, em colunas e blogs,
// <title>Mariana Barbosa</title>, com a manchete na description; a BBC às vezes manda
// <title>Clique aqui</title>.
const KICKER = /^[\p{Lu}\p{N}\s!?:.\-–]{1,20}$/u;
const CALL_TO_ACTION = /^(clique aqui|leia mais|saiba mais|veja mais|veja aqui|confira|assista)[\s.!:…]*$/iu;
const COLUMN_PATH = /\/(colunas?|colunistas?|blogs?)\//i;
// Nome próprio: até 5 palavras com inicial maiúscula, aceitando "de", "da", "em", "e"...
const NAME_LIKE = /^\p{Lu}[\p{L}'.-]*(\s+(d[aeo]s?|e|em|\p{Lu}[\p{L}'.-]*)){0,4}$/u;

export function isKickerTitle(title: string, url: string): boolean {
  if (KICKER.test(title) || CALL_TO_ACTION.test(title)) return true;
  return COLUMN_PATH.test(new URL(url).pathname) && NAME_LIKE.test(title);
}

/** Aceita somente URLs http(s) absolutas (resolve relativas contra base). */
export function safeHttpUrl(raw: string | undefined | null, base?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.toString().length > 2048) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function unaccentLower(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
