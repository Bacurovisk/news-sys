import assert from "node:assert/strict";
import { test } from "node:test";
import { isPathAllowed, parseRobots } from "../robots.ts";

const txt = `
User-agent: *
Disallow: /busca
Disallow: /*.pdf$
Allow: /busca/publica

User-agent: GPTBot
Disallow: /
`;

test("robots: regras do grupo * com Allow mais específico", () => {
  const rules = parseRobots(txt);
  assert.equal(isPathAllowed(rules, "/noticia/1"), true);
  assert.equal(isPathAllowed(rules, "/busca?q=x"), false);
  assert.equal(isPathAllowed(rules, "/busca/publica/1"), true);
  assert.equal(isPathAllowed(rules, "/doc.pdf"), false);
  assert.equal(isPathAllowed(rules, "/doc.pdf?x=1"), true);
});

test("robots: grupo específico do NeoJrNewsBot tem prioridade sobre *", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: NeoJrNewsBot\nAllow: /`);
  assert.equal(isPathAllowed(rules, "/qualquer"), true);
  const blocked = parseRobots(`User-agent: neojrnewsbot\nDisallow: /`);
  assert.equal(isPathAllowed(blocked, "/x"), false);
});
