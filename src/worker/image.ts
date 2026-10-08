// Escolha da imagem do item, nesta ordem:
// media:content / media:thumbnail → enclosure de imagem → primeira <img> da description
// → og:image da página (só domínios das fontes, respeitando robots.txt).
import * as cheerio from "cheerio";
import { config } from "./config.ts";
import { robotsAllows } from "./robots.ts";
import { decodeBody, safeFetch } from "./safe-fetch.ts";
import { safeHttpUrl } from "./normalize.ts";

type MediaNode = { $?: Record<string, string | undefined> } | undefined;

export type FeedItemMedia = {
  mediaContent?: MediaNode[];
  mediaThumbnail?: MediaNode[];
  mediaGroup?: { "media:content"?: MediaNode[]; "media:thumbnail"?: MediaNode[] };
  enclosure?: { url?: string; type?: string };
  content?: string; // description (RSS) ou content (Atom) — nunca content:encoded
};

const MIN_MEDIA_WIDTH = 150;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
// Logo do veículo ou imagem padrão de compartilhamento: melhor mostrar o placeholder.
const GENERIC_IMAGE = /logo|preview-share|default-share|share-default|og-default|placeholder/i;

/** URL http(s) válida e que não seja imagem genérica do site. */
export function usableImage(raw: string | undefined, base: string): string | null {
  const url = safeHttpUrl(raw, base);
  if (!url) return null;
  const file = new URL(url).pathname.split("/").at(-1) ?? "";
  return GENERIC_IMAGE.test(file) ? null : url;
}

function looksLikeImage(node: Record<string, string | undefined>): boolean {
  const medium = node.medium?.toLowerCase();
  const type = node.type?.toLowerCase();
  if (medium) return medium === "image";
  if (type) return type.startsWith("image/");
  return IMAGE_EXT.test(node.url ?? "");
}

function bestMedia(nodes: MediaNode[] | undefined, base: string): string | null {
  let best: { url: string; width: number } | null = null;
  for (const n of nodes ?? []) {
    const attrs = n?.$;
    if (!attrs?.url || !looksLikeImage(attrs)) continue;
    const url = usableImage(attrs.url, base);
    if (!url) continue;
    const width = Number(attrs.width) || 0;
    // Miniaturas declaradas pequenas costumam ser avatar do autor, não a foto da notícia.
    if (width > 0 && width < MIN_MEDIA_WIDTH) continue;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url ?? null;
}

/** Imagem obtida só do conteúdo do feed (sem rede). */
export function imageFromFeed(item: FeedItemMedia, base: string): string | null {
  const fromMedia =
    bestMedia(item.mediaContent, base) ??
    bestMedia(item.mediaGroup?.["media:content"], base) ??
    bestMedia(item.mediaThumbnail, base) ??
    bestMedia(item.mediaGroup?.["media:thumbnail"], base);
  if (fromMedia) return fromMedia;

  const enc = item.enclosure;
  if (enc?.url && (enc.type?.toLowerCase().startsWith("image/") || (!enc.type && IMAGE_EXT.test(enc.url)))) {
    const url = usableImage(enc.url, base);
    if (url) return url;
  }

  if (item.content && /<img/i.test(item.content)) {
    const $ = cheerio.load(item.content, null, false);
    for (const el of $("img").toArray()) {
      const src = $(el).attr("src") ?? $(el).attr("data-src");
      const url = usableImage(src, base);
      // ignora pixels de rastreamento
      if (url && !/(pixel|tracker|feedburner|1x1)/i.test(url)) return url;
    }
  }
  return null;
}

/** Fallback: lê só o <head> da página e pega og:image / twitter:image. */
export async function imageFromPage(
  pageUrl: string,
  isAllowedHost: (h: string) => boolean,
): Promise<string | null> {
  if (!(await robotsAllows(pageUrl, isAllowedHost))) return null;
  const res = await safeFetch(pageUrl, {
    isAllowedHost,
    headers: { "user-agent": config.userAgent, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    timeoutMs: config.page.timeoutMs,
    maxBytes: config.page.maxBytes,
    onLimit: "truncate",
    stopWhen: (body) => /<\/head\s*>|<body[\s>]/i.test(body.toString("latin1")),
  });
  if (res.status !== 200) return null;
  if (!/html/i.test(String(res.headers["content-type"] ?? ""))) return null;

  const html = decodeBody(res.body, String(res.headers["content-type"] ?? ""));
  const $ = cheerio.load(html);
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[property="twitter:image"]').attr("content"),
  ];
  for (const c of candidates) {
    const url = usableImage(c, res.url);
    if (url) return url;
  }
  return null;
}
