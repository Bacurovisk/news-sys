function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} inválida: "${raw}" (esperado inteiro entre ${min} e ${max})`);
  }
  return n;
}

export const config = {
  intervalMinutes: intEnv("WORKER_INTERVAL_MINUTES", 20, 1, 24 * 60),
  concurrency: intEnv("WORKER_CONCURRENCY", 3, 1, 10),
  retentionDays: intEnv("RETENTION_DAYS", 90, 1, 3650),
  /** Falhas seguidas até desativar o feed. */
  maxConsecutiveFailures: 10,
  /** Máximo de itens lidos por feed em cada ciclo. */
  maxItemsPerFeed: 100,
  /** Máximo de páginas buscadas para og:image por feed em cada ciclo (o excedente fica para o próximo). */
  maxOgFetchesPerFeed: 25,
  userAgent: "NeoJrNewsBot/1.0 (+https://news.neojr.com/fontes)",
  feed: { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024 },
  page: { timeoutMs: 10_000, maxBytes: 512 * 1024 },
  robots: { timeoutMs: 10_000, maxBytes: 256 * 1024, ttlMs: 24 * 60 * 60 * 1000 },
  summaryMaxChars: 280,
} as const;
