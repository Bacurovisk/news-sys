// Rate limit simples em memória (janela deslizante aproximada por IP).
// Suficiente para um único processo Next; não compartilha estado entre réplicas.
type Bucket = { count: number; resetAt: number };

// No globalThis: o Next empacota páginas e rotas de API em módulos separados, e um Map
// por módulo deixaria cada um com seu próprio contador.
const store = ((globalThis as { __newsRateLimit?: { buckets: Map<string, Bucket>; lastSweep: number } })
  .__newsRateLimit ??= { buckets: new Map(), lastSweep: Date.now() });
const buckets = store.buckets;

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (now - store.lastSweep > windowMs) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    store.lastSweep = now;
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

/**
 * IP do cliente. Atrás do Nginx Proxy Manager, X-Real-IP é definido pelo proxy com o
 * endereço da conexão; o primeiro valor de X-Forwarded-For pode ser forjado pelo cliente.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "local";
}

export const SEARCH_LIMIT = { limit: 30, windowMs: 60_000 };
