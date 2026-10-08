import type { Scope } from "../../../src/generated/prisma/enums.ts";

export type SourceSeed = {
  name: string;
  siteUrl: string;
  feedUrl: string;
  scope: Scope;
  uf?: string;
  city?: string;
  /** slug da categoria padrão (feeds por editoria) */
  category?: string;
};

// Adicionar uma UF = criar seed-data/sources/<uf>.ts e incluir aqui.
// As fontes validadas entram na fase 3.
export const sources: SourceSeed[] = [];
