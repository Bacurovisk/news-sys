import { BlockList, isIP } from "node:net";

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

// Faixas do Cloudflare (https://www.cloudflare.com/ips-v4 e /ips-v6, conferidas em 08/10/2026).
const cloudflare = new BlockList();
for (const cidr of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]) {
  const [ip, prefix] = cidr.split("/");
  cloudflare.addSubnet(ip, Number(prefix), "ipv4");
}
for (const cidr of [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [ip, prefix] = cidr.split("/");
  cloudflare.addSubnet(ip, Number(prefix), "ipv6");
}

function isCloudflare(ip: string): boolean {
  const family = isIP(ip);
  return family === 4 ? cloudflare.check(ip, "ipv4") : family === 6 ? cloudflare.check(ip, "ipv6") : false;
}

/**
 * IP do cliente. O Nginx Proxy Manager define X-Real-IP com o endereço da conexão
 * (o cliente não consegue forjar; o primeiro valor de X-Forwarded-For consegue).
 * Atrás do Cloudflare esse endereço é o do Cloudflare: aí vale CF-Connecting-IP,
 * aceito só quando a conexão veio mesmo de uma faixa do Cloudflare.
 */
export function clientIp(headers: Headers): string {
  const peer = headers.get("x-real-ip")?.trim();
  if (!peer) return "local";
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && isIP(cf) && isCloudflare(peer)) return cf;
  return peer;
}

export const SEARCH_LIMIT = { limit: 30, windowMs: 60_000 };
