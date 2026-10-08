import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHostAllowList } from "../domains.ts";
import { checkUrl, FetchError, isBlockedIp, safeFetch } from "../safe-fetch.ts";

test("isBlockedIp bloqueia faixas internas e libera IPs públicos", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ["186.192.83.7", "8.8.8.8", "2800:3f0:4001:80a::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

test("checkUrl exige http(s), portas 80/443, host permitido e sem IP literal", () => {
  const allow = makeHostAllowList(["https://www.folha.uol.com.br/"]);
  assert.equal(checkUrl("https://www1.folha.uol.com.br/x", allow).hostname, "www1.folha.uol.com.br");
  const code = (u: string) => {
    try {
      checkUrl(u, allow);
      return "ok";
    } catch (e) {
      return (e as FetchError).code;
    }
  };
  assert.equal(code("https://evil.com/"), "blocked_host");
  assert.equal(code("https://folha.uol.com.br.evil.com/"), "blocked_host");
  assert.equal(code("https://www.folha.uol.com.br:8080/"), "blocked_port");
  assert.equal(code("file:///etc/passwd"), "blocked_protocol");
  assert.equal(code("http://127.0.0.1/"), "blocked_ip");
  assert.equal(code("http://[::1]/"), "blocked_ip");
  assert.equal(code("https://user:pw@www.folha.uol.com.br/"), "blocked_credentials");
});

test("safeFetch recusa host que resolve para loopback (checagem no momento da conexão)", async () => {
  await assert.rejects(
    safeFetch("http://localhost/", { isAllowedHost: () => true, timeoutMs: 2000, maxBytes: 1000 }),
    (e: FetchError) => e.code === "blocked_ip",
  );
});
