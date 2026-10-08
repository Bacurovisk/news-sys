import type { Scope } from "../../../src/generated/prisma/enums.ts";
import { am } from "./am.ts";
import { nacional } from "./nacional.ts";

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

// Adicionar uma UF = criar seed-data/sources/<uf>.ts, validar com
// `npx tsx scripts/validate-feeds.ts` e incluir a lista aqui.
export const sources: SourceSeed[] = [...nacional, ...am];
