import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryFromRules, isIgnoredTitle, loadIgnoredTitles, loadRules } from "../categorize.ts";

const rules = loadRules();

test("regras de categoria (arquivo real)", () => {
  assert.equal(categoryFromRules(rules, "Flamengo vence o Palmeiras com dois gols"), "esportes");
  assert.equal(categoryFromRules(rules, "Golpe do Pix faz novas vítimas"), "economia");
  assert.equal(categoryFromRules(rules, "Vacinação contra a gripe é ampliada"), "saude");
  assert.equal(categoryFromRules(rules, "Datafolha: pesquisa mostra Lula à frente"), "politica");
  assert.equal(categoryFromRules(rules, "Chuva alaga ruas da Zona Norte"), null);
});

test("ignoreTitles (arquivo real): descarta resultado automático por seção eleitoral", () => {
  const ignored = loadIgnoredTitles();
  assert.equal(
    isIgnoredTitle(ignored, "Resultado das eleições 2026 em São Gabriel da Cachoeira (AM): votação para presidente na 19ª zona eleitoral"),
    true,
  );
  assert.equal(isIgnoredTitle(ignored, "Resultado das eleições: o que muda no Congresso"), false);
  assert.equal(isIgnoredTitle(ignored, "TSE divulga resultado das eleições 2026 em Manaus"), false);
});
