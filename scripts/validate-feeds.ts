// Valida feeds de verdade (HTTP + parse + datas + imagens) antes de entrarem no seed.
// Uso:
//   npx tsx scripts/validate-feeds.ts                 valida as fontes de prisma/seed-data
//   npx tsx scripts/validate-feeds.ts candidatas.json valida uma lista [{name, siteUrl, feedUrl, ...}]
//   --json                                            saída em JSON (uma linha por feed)
import { readFileSync } from "node:fs";
import Parser from "rss-parser";
import { sources as seedSources, type SourceSeed } from "../prisma/seed-data/sources/index.ts";
import { config } from "../src/worker/config.ts";
import { makeHostAllowList } from "../src/worker/domains.ts";
import { imageFromFeed, type FeedItemMedia } from "../src/worker/image.ts";
import { canonicalUrl } from "../src/worker/normalize.ts";
import { decodeBody, FetchError, safeFetch } from "../src/worker/safe-fetch.ts";

type Result = {
  name: string;
  feedUrl: string;
  ok: boolean;
  status: string;
  items: number;
  newestHoursAgo: number | null;
  withImagePct: number;
  finalUrl?: string;
  sample?: string;
  /** status HTTP ao abrir o link do primeiro item (o card leva para lá) */
  linkStatus?: string;
};

const parser = new Parser<Record<string, unknown>, FeedItemMedia>({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:group", "mediaGroup"],
    ],
  },
});

async function checkFirstLink(link: string | undefined, s: SourceSeed): Promise<string> {
  const url = canonicalUrl(link, s.feedUrl);
  if (!url) return "sem_link";
  try {
    const res = await safeFetch(url, {
      isAllowedHost: makeHostAllowList([s.feedUrl, s.siteUrl]),
      headers: { "user-agent": config.userAgent, accept: "text/html,*/*;q=0.5" },
      timeoutMs: config.page.timeoutMs,
      maxBytes: 64 * 1024,
      onLimit: "truncate",
    });
    return String(res.status);
  } catch (err) {
    return err instanceof FetchError ? err.code : "error";
  }
}

async function validate(s: SourceSeed): Promise<Result> {
  const base = { name: s.name, feedUrl: s.feedUrl, items: 0, newestHoursAgo: null, withImagePct: 0 };
  try {
    const res = await safeFetch(s.feedUrl, {
      isAllowedHost: makeHostAllowList([s.feedUrl, s.siteUrl]),
      headers: { "user-agent": config.userAgent, accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" },
      timeoutMs: config.feed.timeoutMs,
      maxBytes: config.feed.maxBytes,
    });
    if (res.status !== 200) return { ...base, ok: false, status: `http_${res.status}` };
    const feed = await parser.parseString(decodeBody(res.body, String(res.headers["content-type"] ?? "")));
    const items = feed.items ?? [];
    const dates = items
      .map((i) => new Date(i.isoDate ?? i.pubDate ?? "").getTime())
      .filter((t) => !Number.isNaN(t));
    const newest = dates.length ? Math.max(...dates) : null;
    const withImg = items.filter((i) => imageFromFeed(i, i.link ?? s.feedUrl)).length;
    const newestHoursAgo = newest ? Math.round((Date.now() - newest) / 36e5) : null;
    const stale = newestHoursAgo === null || newestHoursAgo > 24 * 7;
    const linkStatus = await checkFirstLink(items[0]?.link, s);
    // 401/403/429: o site barra robôs, mas o link abre no navegador (aviso, não falha).
    const linkBotBlocked = ["401", "403", "429"].includes(linkStatus);
    const linkOk = linkStatus === "200" || linkBotBlocked;
    return {
      ...base,
      ok: items.length > 0 && !stale && linkOk,
      status:
        items.length === 0
          ? "empty"
          : stale
            ? "stale"
            : !linkOk
              ? `link_${linkStatus}`
              : linkBotBlocked
                ? `200 (link ${linkStatus})`
                : "200",
      linkStatus,
      items: items.length,
      newestHoursAgo,
      withImagePct: items.length ? Math.round((withImg / items.length) * 100) : 0,
      finalUrl: res.url !== s.feedUrl ? res.url : undefined,
      sample: items[0]?.title?.slice(0, 70),
    };
  } catch (err) {
    const status = err instanceof FetchError ? err.code : err instanceof Error ? `parse: ${err.message.slice(0, 60)}` : "error";
    return { ...base, ok: false, status };
  }
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const file = args.find((a) => !a.startsWith("--"));
const list: SourceSeed[] = file ? JSON.parse(readFileSync(file, "utf8")) : seedSources;

const results: Result[] = new Array(list.length);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await validate(list[i]);
    }
  }),
);

if (json) {
  for (const r of results) console.log(JSON.stringify(r));
} else {
  for (const r of results) {
    console.log(
      [
        r.ok ? "OK  " : "FAIL",
        r.status.padEnd(16),
        String(r.items).padStart(3),
        `${r.newestHoursAgo ?? "-"}h`.padStart(6),
        `${r.withImagePct}%img`.padStart(8),
        r.name.padEnd(32),
        r.feedUrl,
        r.finalUrl ? `→ ${r.finalUrl}` : "",
      ].join("  "),
    );
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} válidos`);
}
