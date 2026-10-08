import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalUrl, cleanSummary, htmlToText, isKickerTitle, safeHttpUrl, truncateWords, urlHash } from "../normalize.ts";

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

test("isKickerTitle: chapéu em maiúsculas e nome de colunista/blog", () => {
  const col = "https://economia.uol.com.br/colunas/mariana-barbosa/2026/10/08/eventual-governo.htm";
  const blog = "https://www1.folha.uol.com.br/blogs/musica-em-letras/2026/10/pequeno-cidadao.shtml";
  assert.equal(isKickerTitle("AO VIVO", "https://www.uol.com.br/x.htm"), true);
  assert.equal(isKickerTitle("Mariana Barbosa", col), true);
  assert.equal(isKickerTitle("Conrado Hübner", col), true);
  assert.equal(isKickerTitle("Caçador de Carros", col), true);
  assert.equal(isKickerTitle("Música em Letras", blog), true);
  // manchete de verdade em coluna: fica
  assert.equal(isKickerTitle("Proibir não é proteger?", col), false);
  assert.equal(isKickerTitle("O mundo sobreviveu ao auge de Donald Trump", col), false);
  // nome fora de coluna/blog: fica (ex.: matéria sobre uma pessoa)
  assert.equal(isKickerTitle("Mariana Barbosa", "https://g1.globo.com/noticia/x.ghtml"), false);
});

test("isKickerTitle: chamadas genéricas e /colunistas/", () => {
  const any = "https://www.bbc.com/portuguese/articles/x";
  assert.equal(isKickerTitle("Clique aqui", any), true);
  assert.equal(isKickerTitle("Leia mais…", any), true);
  assert.equal(isKickerTitle("Clique aqui e veja o mapa da votação", any), false);
  assert.equal(isKickerTitle("Rosana Hermann", "https://f5.folha.uol.com.br/colunistas/rosana-hermann/2026/10/x.shtml"), true);
  assert.equal(isKickerTitle("Salmão à Das Dorf", "https://ocp.news/colunistas/salmao-a-das-dorf"), false);
});
