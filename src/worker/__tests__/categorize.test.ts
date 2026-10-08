import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryFromRules, loadRules } from "../categorize.ts";

const rules = loadRules();

test("regras de categoria (arquivo real)", () => {
  assert.equal(categoryFromRules(rules, "Flamengo vence o Palmeiras com dois gols"), "esportes");
  assert.equal(categoryFromRules(rules, "Golpe do Pix faz novas vítimas"), "economia");
  assert.equal(categoryFromRules(rules, "Vacinação contra a gripe é ampliada"), "saude");
  assert.equal(categoryFromRules(rules, "Datafolha: pesquisa mostra Lula à frente"), "politica");
  assert.equal(categoryFromRules(rules, "Chuva alaga ruas da Zona Norte"), null);
});
