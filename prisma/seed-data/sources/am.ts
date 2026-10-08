import type { SourceSeed } from "./index.ts";

// Amazonas — validadas em 08/10/2026 (scripts/validate-feeds.ts).
// Estaduais: categoria por regras de palavra-chave; sem regra, "Regional".

const estadual = (name: string, siteUrl: string, feedUrl: string): SourceSeed => ({
  name,
  siteUrl,
  feedUrl,
  scope: "ESTADUAL",
  uf: "AM",
});

export const am: SourceSeed[] = [
  estadual("g1 Amazonas", "https://g1.globo.com/am/amazonas/", "https://g1.globo.com/rss/g1/am/amazonas/"),
  estadual("D24AM", "https://d24am.com/", "https://d24am.com/feed/"),
  estadual("Em Tempo", "https://emtempo.com.br/", "https://emtempo.com.br/feed/"),
  estadual("Amazonas Atual", "https://amazonasatual.com.br/", "https://amazonasatual.com.br/feed/"),
  estadual("Amazônia Real", "https://amazoniareal.com.br/", "https://amazoniareal.com.br/feed/"),
  estadual("Amazonas Notícias", "https://amazonasnoticias.com.br/", "https://amazonasnoticias.com.br/feed/"),
  estadual("BNC Amazonas", "https://www.bncamazonas.com.br/", "https://www.bncamazonas.com.br/feed/"),
  {
    name: "Prefeitura de Manaus",
    siteUrl: "https://www.manaus.am.gov.br/",
    feedUrl: "https://www.manaus.am.gov.br/feed/",
    scope: "MUNICIPAL",
    uf: "AM",
    city: "Manaus",
  },
];
