// Categoria do artigo: categoria padrão da fonte → regras de palavra-chave no título
// (config/category-rules.json) → fallback ("brasil" para fontes nacionais,
// "regional" para estaduais/municipais).
import { readFileSync } from "node:fs";
import path from "node:path";
import { unaccentLower } from "./normalize.ts";

type RulesFile = { rules: { category: string; keywords: string[] }[]; ignoreTitles?: string[] };
type CompiledRule = { category: string; re: RegExp };

export const RULES_PATH = process.env.CATEGORY_RULES_PATH ?? path.resolve("config/category-rules.json");

function keywordPattern(kw: string): string {
  const k = unaccentLower(kw.trim());
  const prefix = k.endsWith("*");
  const word = (prefix ? k.slice(0, -1) : k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return prefix ? `${word}[\\p{L}\\p{N}]*` : word;
}

export function compileRules(file: RulesFile): CompiledRule[] {
  return file.rules.map((r) => ({
    category: r.category,
    re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${r.keywords.map(keywordPattern).join("|")})(?![\\p{L}\\p{N}])`, "u"),
  }));
}

export function loadRules(file = RULES_PATH): CompiledRule[] {
  return compileRules(JSON.parse(readFileSync(file, "utf8")) as RulesFile);
}

export function categoryFromRules(rules: CompiledRule[], title: string): string | null {
  const t = unaccentLower(title);
  return rules.find((r) => r.re.test(t))?.category ?? null;
}

/** Padrões (regex, sem acento e em minúsculas) de títulos que o worker descarta. */
export function loadIgnoredTitles(file = RULES_PATH): RegExp[] {
  const { ignoreTitles = [] } = JSON.parse(readFileSync(file, "utf8")) as RulesFile;
  return ignoreTitles.map((p) => new RegExp(p, "u"));
}

export function isIgnoredTitle(patterns: RegExp[], title: string): boolean {
  if (!patterns.length) return false;
  const t = unaccentLower(title);
  return patterns.some((re) => re.test(t));
}
