// Logs estruturados: um objeto JSON por linha no stdout (pronto para Wazuh/journald).
type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = { ts: new Date().toISOString(), level, event, ...fields };
  process.stdout.write(JSON.stringify(line) + "\n");
}

export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as NodeJS.ErrnoException).code;
  // AggregateError (ex.: falha em IPv4 e IPv6) vem com message vazia.
  return err.message || code || err.name;
}
