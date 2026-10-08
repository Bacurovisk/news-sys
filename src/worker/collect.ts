import { performance } from "node:perf_hooks";
import Parser from "rss-parser";
import type { PrismaClient, Source } from "@/generated/prisma/client.ts";
import { categoryFromRules, type loadRules } from "./categorize.ts";
import { config } from "./config.ts";
import { imageFromFeed, imageFromPage, type FeedItemMedia } from "./image.ts";
import { errorMessage, log } from "./logger.ts";
import { canonicalUrl, cleanSummary, htmlToText, isKickerTitle, truncateWords, urlHash } from "./normalize.ts";
import { decodeBody, FetchError, safeFetch } from "./safe-fetch.ts";

type CustomItem = FeedItemMedia & { summary?: string };

// content:encoded é parseado pela lib, mas nunca é lido aqui (não guardamos corpo de matéria).
const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:group", "mediaGroup"],
    ],
  },
});

export type CollectContext = {
  prisma: PrismaClient;
  isAllowedHost: (hostname: string) => boolean;
  rules: ReturnType<typeof loadRules>;
  categoryIdBySlug: Map<string, number>;
};

export type CollectResult = { status: string; items: number; newArticles: number; deferred?: number };

type Candidate = {
  url: string;
  urlHash: string;
  title: string;
  summary: string;
  publishedAt: Date;
  item: CustomItem;
};

function rawDate(item: Parser.Item): Date | null {
  const raw = item.isoDate ?? item.pubDate;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Alguns feeds rotulam horário UTC com offset de Brasília (ex.: UOL publica "15:06 -0300"
 * às 15:06 UTC), jogando todos os itens horas no futuro. Se o item mais recente estiver
 * no futuro, desloca o feed inteiro pelo número de horas cheias do desvio (até 14 h).
 */
function feedClockSkewMs(items: Parser.Item[], now: Date): number {
  let newest = 0;
  for (const i of items) newest = Math.max(newest, rawDate(i)?.getTime() ?? 0);
  const ahead = newest - now.getTime();
  if (ahead <= 5 * 60_000) return 0;
  const hours = Math.ceil(ahead / 3_600_000);
  return hours <= 14 ? hours * 3_600_000 : 0;
}

function toCandidates(
  items: (Parser.Item & CustomItem)[],
  feedUrl: string,
  isAllowedHost: (hostname: string) => boolean,
): Candidate[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - config.retentionDays * 86_400_000);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const skewMs = feedClockSkewMs(items, now);
  if (skewMs) log("warn", "feed_clock_skew", { feed: feedUrl, hours: skewMs / 3_600_000 });

  for (const item of items.slice(0, config.maxItemsPerFeed)) {
    const url = canonicalUrl(item.link ?? (item.guid?.startsWith("http") ? item.guid : undefined), feedUrl);
    // Só artigos de domínios das fontes cadastradas (descarta anúncios e links de terceiros).
    if (!url || !isAllowedHost(new URL(url).hostname)) continue;

    let title = htmlToText(item.title);
    let description = cleanSummary(htmlToText(item.summary ?? item.content));
    if ((!title || isKickerTitle(title, url)) && description) {
      title = description;
      description = "";
    }
    title = truncateWords(title, 300);
    if (!title) continue;
    const hash = urlHash(url);
    if (seen.has(hash)) continue;
    seen.add(hash);

    // Sem data: hora da coleta. Ainda no futuro após a correção de fuso: "agora".
    const raw = rawDate(item);
    const d = raw ? new Date(raw.getTime() - skewMs) : now;
    const publishedAt = d > now ? now : d;
    if (publishedAt < cutoff) continue;

    const summary = truncateWords(description === title ? "" : description, config.summaryMaxChars);
    out.push({ url, urlHash: hash, title, summary, publishedAt, item });
  }
  return out;
}

async function fetchAndInsert(source: Source, ctx: CollectContext): Promise<CollectResult> {
  const headers: Record<string, string> = {
    "user-agent": config.userAgent,
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  };
  if (source.etag) headers["if-none-match"] = source.etag;
  if (source.lastModified) headers["if-modified-since"] = source.lastModified;

  const res = await safeFetch(source.feedUrl, {
    isAllowedHost: ctx.isAllowedHost,
    headers,
    timeoutMs: config.feed.timeoutMs,
    maxBytes: config.feed.maxBytes,
  });

  if (res.status === 304) {
    await ctx.prisma.source.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastStatus: "304", consecutiveFailures: 0 },
    });
    return { status: "304", items: 0, newArticles: 0 };
  }
  if (res.status !== 200) throw new FetchError(`http_${res.status}`);

  let feed: Parser.Output<CustomItem>;
  try {
    feed = await parser.parseString(decodeBody(res.body, String(res.headers["content-type"] ?? "")));
  } catch (err) {
    throw new FetchError("parse_error", errorMessage(err));
  }

  const candidates = toCandidates(feed.items, source.feedUrl, ctx.isAllowedHost);
  const existing = new Set(
    (
      await ctx.prisma.article.findMany({
        where: { urlHash: { in: candidates.map((c) => c.urlHash) } },
        select: { urlHash: true },
      })
    ).map((a) => a.urlHash),
  );
  const fresh = candidates.filter((c) => !existing.has(c.urlHash));

  const fallbackSlug = source.scope === "NACIONAL" ? "brasil" : "regional";
  // Itens mais recentes primeiro: se o limite de og:image estourar, os mais antigos
  // ficam para o próximo ciclo (em vez de entrarem sem imagem).
  fresh.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  let ogFetches = 0;
  let deferred = 0;
  const data = [];
  for (const c of fresh) {
    let imageUrl = imageFromFeed(c.item, c.url);
    if (!imageUrl) {
      if (ogFetches >= config.maxOgFetchesPerFeed) {
        deferred++;
        continue;
      }
      ogFetches++;
      try {
        imageUrl = await imageFromPage(c.url, ctx.isAllowedHost);
      } catch (err) {
        log("warn", "og_image_failed", { sourceId: source.id, url: c.url, error: errorMessage(err) });
      }
    }

    const categoryId =
      source.defaultCategoryId ??
      ctx.categoryIdBySlug.get(categoryFromRules(ctx.rules, c.title) ?? fallbackSlug) ??
      ctx.categoryIdBySlug.get(fallbackSlug)!;

    data.push({
      sourceId: source.id,
      url: c.url,
      urlHash: c.urlHash,
      title: c.title,
      summary: c.summary,
      imageUrl,
      publishedAt: c.publishedAt,
      categoryId,
      uf: source.uf,
      city: source.city,
    });
  }

  const inserted = data.length ? (await ctx.prisma.article.createMany({ data, skipDuplicates: true })).count : 0;

  await ctx.prisma.source.update({
    where: { id: source.id },
    data: {
      lastFetchedAt: new Date(),
      lastStatus: "200",
      consecutiveFailures: 0,
      // Com itens adiados, não guarda validadores: o próximo GET precisa vir completo (não 304).
      etag: !deferred && typeof res.headers.etag === "string" ? res.headers.etag : null,
      lastModified: !deferred && typeof res.headers["last-modified"] === "string" ? res.headers["last-modified"] : null,
    },
  });

  return { status: "200", items: feed.items.length, newArticles: inserted, deferred };
}

/** Coleta um feed. Nunca lança: falhas são registradas na fonte e no log. */
export async function collectSource(source: Source, ctx: CollectContext): Promise<CollectResult> {
  const started = performance.now();
  try {
    const result = await fetchAndInsert(source, ctx);
    log("info", "feed_done", {
      sourceId: source.id,
      feed: source.feedUrl,
      status: result.status,
      items: result.items,
      newArticles: result.newArticles,
      deferred: result.deferred ?? 0,
      durationMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (err) {
    const status = err instanceof FetchError ? err.code : "error";
    const failures = source.consecutiveFailures + 1;
    const deactivate = failures >= config.maxConsecutiveFailures;
    try {
      await ctx.prisma.source.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          lastStatus: status.slice(0, 64),
          consecutiveFailures: failures,
          ...(deactivate ? { active: false } : {}),
        },
      });
    } catch (dbErr) {
      log("error", "source_update_failed", { sourceId: source.id, error: errorMessage(dbErr) });
    }
    log("warn", "feed_failed", {
      sourceId: source.id,
      feed: source.feedUrl,
      status,
      error: errorMessage(err),
      consecutiveFailures: failures,
      durationMs: Math.round(performance.now() - started),
    });
    if (deactivate) {
      log("warn", "feed_deactivated", { sourceId: source.id, feed: source.feedUrl, consecutiveFailures: failures });
    }
    return { status, items: 0, newArticles: 0 };
  }
}
