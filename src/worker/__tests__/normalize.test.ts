import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalUrl, cleanSummary, htmlToText, safeHttpUrl, truncateWords, urlHash } from "../normalize.ts";

test("canonicalUrl remove rastreamento, fragmento e ordena parâmetros", () => {
  assert.equal(
    canonicalUrl("https://g1.globo.com/a.ghtml?utm_source=x&fbclid=1&gclid=2&b=2&a=1#topo"),
    "https://g1.globo.com/a.ghtml?a=1&b=2",
  );
});

test("canonicalUrl desembrulha redirecionador da Folha", () => {
  assert.equal(
    canonicalUrl("https://redir.folha.com.br/redir/online/poder/rss091/*https://www1.folha.uol.com.br/poder/x.shtml"),
    "https://www1.folha.uol.com.br/poder/x.shtml",
  );
});

test("canonicalUrl rejeita esquemas que não são http(s)", () => {
  assert.equal(canonicalUrl("javascript:alert(1)"), null);
  assert.equal(canonicalUrl("data:text/html,x"), null);
  assert.equal(safeHttpUrl("ftp://x/y.jpg"), null);
  assert.equal(safeHttpUrl("/img.jpg", "https://site.com/a/"), "https://site.com/img.jpg");
});

test("urlHash é SHA-256 hex", () => {
  assert.match(urlHash("https://x.com/"), /^[0-9a-f]{64}$/);
});

test("htmlToText remove tags/scripts e decodifica entidades (inclusive duplas)", () => {
  assert.equal(htmlToText("<p>Olá &amp; até&nbsp;logo<script>alert(1)</script></p><br>Fim"), "Olá & até logo Fim");
  assert.equal(htmlToText("&amp;quot;ok&amp;quot;"), '"ok"');
  assert.equal(htmlToText("&lt;img src=x onerror=alert(1)&gt;"), "");
});

test("truncateWords corta em limite de palavra com reticências", () => {
  const out = truncateWords("palavra ".repeat(60).trim(), 280);
  assert.ok(out.length <= 280);
  assert.ok(out.endsWith("palavra…"));
  assert.equal(truncateWords("curto", 280), "curto");
});

test("cleanSummary remove rodapé de WordPress", () => {
  assert.equal(cleanSummary("Resumo. The post Título appeared first on Site."), "Resumo.");
  assert.equal(cleanSummary("Resumo. O post Título apareceu primeiro em Site."), "Resumo.");
});
