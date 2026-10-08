// Worker de coleta. Uso:
//   tsx src/worker/index.ts          loop contínuo (intervalo WORKER_INTERVAL_MINUTES)
//   tsx src/worker/index.ts --once   um único ciclo e sai
import { performance } from "node:perf_hooks";
import { prisma } from "@/lib/db";
import { collectSource, type CollectContext } from "./collect.ts";
import { loadRules, RULES_PATH } from "./categorize.ts";
import { config } from "./config.ts";
import { makeHostAllowList } from "./domains.ts";
import { errorMessage, log } from "./logger.ts";

const RETENTION_JOB = "retention";
const stopController = new AbortController();

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !stopController.signal.aborted) {
      await fn(items[next++]);
    }
  });
  await Promise.all(workers);
}

async function runCycle(): Promise<void> {
  const started = performance.now();
  const [allSources, categories] = await Promise.all([prisma.source.findMany(), prisma.category.findMany()]);
  const active = allSources.filter((s) => s.active);
  const rules = loadRules();

  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  for (const r of rules) {
    if (!categoryIdBySlug.has(r.category)) log("warn", "rule_unknown_category", { category: r.category });
  }

  const ctx: CollectContext = {
    prisma,
    // Mesmo fontes inativas liberam o domínio: a lista só cresce por cadastro no seed.
    isAllowedHost: makeHostAllowList(allSources.flatMap((s) => [s.feedUrl, s.siteUrl])),
    rules,
    categoryIdBySlug,
  };

  let ok = 0;
  let failed = 0;
  let newArticles = 0;
  await mapLimit(active, config.concurrency, async (source) => {
    const r = await collectSource(source, ctx);
    if (r.status === "200" || r.status === "304") ok++;
    else failed++;
    newArticles += r.newArticles;
  });

  log("info", "cycle_done", {
    feeds: active.length,
    ok,
    failed,
    newArticles,
    durationMs: Math.round(performance.now() - started),
  });
}

async function runRetentionIfDue(): Promise<void> {
  const job = await prisma.jobRun.findUnique({ where: { name: RETENTION_JOB } });
  if (job && Date.now() - job.lastRunAt.getTime() < 24 * 60 * 60 * 1000) return;

  const cutoff = new Date(Date.now() - config.retentionDays * 86_400_000);
  const { count } = await prisma.article.deleteMany({ where: { publishedAt: { lt: cutoff } } });
  await prisma.jobRun.upsert({
    where: { name: RETENTION_JOB },
    create: { name: RETENTION_JOB, lastRunAt: new Date() },
    update: { lastRunAt: new Date() },
  });
  log("info", "retention_done", { deleted: count, olderThan: cutoff.toISOString() });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  log("info", "worker_start", {
    once,
    intervalMinutes: config.intervalMinutes,
    concurrency: config.concurrency,
    retentionDays: config.retentionDays,
    rules: RULES_PATH,
  });

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      log("info", "worker_stopping", { signal: sig });
      stopController.abort();
    });
  }

  while (!stopController.signal.aborted) {
    try {
      await runRetentionIfDue();
    } catch (err) {
      log("error", "retention_failed", { error: errorMessage(err) });
    }
    try {
      await runCycle();
    } catch (err) {
      log("error", "cycle_failed", { error: errorMessage(err) });
    }
    if (once) break;
    await sleep(config.intervalMinutes * 60_000, stopController.signal);
  }

  await prisma.$disconnect();
  log("info", "worker_stopped");
}

main().catch((err) => {
  log("error", "worker_crashed", { error: errorMessage(err) });
  process.exit(1);
});
