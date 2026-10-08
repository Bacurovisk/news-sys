import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCursor, encodeCursor } from "../cursor.ts";
import { filtersToSearch, parseFilters } from "../filters.ts";
import { rateLimit } from "../rate-limit.ts";
import { safeHref } from "../safe-url.ts";
import { timeAgo } from "../time.ts";

test("parseFilters valida e normaliza", () => {
  const f = parseFilters({ q: "  vacina\u0000  manaus ", uf: "am", cidade: "Manaus", cat: "Saude", cursor: "x" });
  assert.deepEqual(f, { q: "vacina manaus", uf: "AM", cidade: "Manaus", cat: "saude", cursor: "x" });
  assert.equal(parseFilters({ q: "a".repeat(500) }).q?.length, 100);
  assert.equal(parseFilters({ uf: "XYZ" }).uf, undefined);
  assert.equal(parseFilters({ cidade: "Manaus" }).cidade, undefined, "cidade sem UF é ignorada");
  assert.equal(parseFilters({ cat: "<script>" }).cat, undefined);
  assert.equal(parseFilters(new URLSearchParams("q=a&q=b")).q, "a");
});

test("filtersToSearch omite vazios", () => {
  assert.equal(filtersToSearch({}), "");
  assert.equal(filtersToSearch({ q: "a b", uf: "AM", cat: "saude" }), "?q=a+b&uf=AM&cat=saude");
});

test("cursor: ida e volta e rejeição de lixo", () => {
  const d = new Date("2026-10-08T12:00:00.000Z");
  assert.deepEqual(decodeCursor(encodeCursor({ kind: "keyset", publishedAt: d, id: 42 })), { kind: "keyset", publishedAt: d, id: 42 });
  assert.deepEqual(decodeCursor(encodeCursor({ kind: "offset", offset: 40 })), { kind: "offset", offset: 40 });
  assert.equal(decodeCursor("lixo!!"), null);
  assert.equal(decodeCursor(Buffer.from('{"o":100000}').toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from('{"t":"x","i":1}').toString("base64url")), null);
});

test("safeHref aceita só http(s)", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("https://g1.globo.com/x"), "https://g1.globo.com/x");
});

test("timeAgo", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  assert.equal(timeAgo(new Date("2026-10-08T14:59:30Z"), now), "agora");
  assert.equal(timeAgo(new Date("2026-10-08T14:55:00Z"), now), "há 5 min");
  assert.equal(timeAgo(new Date("2026-10-08T13:00:00Z"), now), "há 2 h");
  assert.equal(timeAgo(new Date("2026-10-07T12:00:00Z"), now), "ontem");
  assert.equal(timeAgo(new Date("2026-10-05T12:00:00Z"), now), "há 3 dias");
  assert.equal(timeAgo(new Date("2026-09-01T12:00:00Z"), now), "1 de set.");
});

test("rateLimit bloqueia após o limite e isola chaves", () => {
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("t:a", 3, 60_000).ok, true);
  assert.equal(rateLimit("t:a", 3, 60_000).ok, false);
  assert.equal(rateLimit("t:b", 3, 60_000).ok, true);
});

test("clientIp: X-Real-IP do proxy; CF-Connecting-IP só vindo do Cloudflare", async () => {
  const { clientIp } = await import("../rate-limit.ts");
  const h = (o: Record<string, string>) => new Headers(o);
  assert.equal(clientIp(h({})), "local");
  assert.equal(clientIp(h({ "x-real-ip": "200.1.2.3" })), "200.1.2.3");
  assert.equal(clientIp(h({ "x-real-ip": "200.1.2.3", "cf-connecting-ip": "9.9.9.9" })), "200.1.2.3", "forjado fora do Cloudflare");
  assert.equal(clientIp(h({ "x-real-ip": "172.70.1.1", "cf-connecting-ip": "177.10.20.30" })), "177.10.20.30");
  assert.equal(clientIp(h({ "x-real-ip": "2606:4700::1", "cf-connecting-ip": "2804:14c::1" })), "2804:14c::1");
  assert.equal(clientIp(h({ "x-real-ip": "172.70.1.1", "cf-connecting-ip": "lixo" })), "172.70.1.1");
});
