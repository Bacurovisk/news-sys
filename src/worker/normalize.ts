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
  $("br, p, div, li, h1, h2, h3, h4").after(" ");
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
  /\s*(Continue|Continuar) (lendo|a ler).*$/i,
  /\s*(Leia|Veja) (mais|também|tambem)\s*(\.{3}|…|»)?$/i,
  /\s*\[(…|\.\.\.)\]\s*$/,
];

export function cleanSummary(text: string): string {
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, "");
  return out.trim();
}

/** Corta em limite de palavra, com reticências, sem passar de max caracteres. */
export function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  const base = cut > max * 0.6 ? slice.slice(0, cut) : slice;
  return base.replace(/[\s,;:.\-–—(]+$/u, "") + "…";
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
