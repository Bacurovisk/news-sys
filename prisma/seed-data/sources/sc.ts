import type { SourceSeed } from "./index.ts";

// Santa Catarina — validadas em 08/10/2026 (scripts/validate-feeds.ts).
// Fora por enquanto: Agência de Notícias SC (cabeçalho HTTP inválido, recusado pelo Node),
// Diarinho, Floripa News e prefeituras de Florianópolis/Joinville (sem feed válido).

const estadual = (name: string, siteUrl: string, feedUrl: string): SourceSeed => ({
  name,
  siteUrl,
  feedUrl,
  scope: "ESTADUAL",
  uf: "SC",
});

const municipal = (name: string, siteUrl: string, feedUrl: string, city: string): SourceSeed => ({
  name,
  siteUrl,
  feedUrl,
  scope: "MUNICIPAL",
  uf: "SC",
  city,
});

export const sc: SourceSeed[] = [
  estadual("g1 Santa Catarina", "https://g1.globo.com/sc/santa-catarina/", "https://g1.globo.com/rss/g1/sc/santa-catarina/"),
  estadual("NSC Total", "https://www.nsctotal.com.br/", "https://www.nsctotal.com.br/feed"),
  estadual("ND+", "https://ndmais.com.br/", "https://ndmais.com.br/feed/"),
  estadual("SCC10", "https://scc10.com.br/", "https://scc10.com.br/feed/"),
  estadual("Portal Making Of", "https://portalmakingof.com.br/", "https://portalmakingof.com.br/feed/"),
  estadual("OCP News", "https://ocp.news/", "https://ocp.news/feed"),
  municipal("O Município", "https://omunicipio.com.br/", "https://omunicipio.com.br/feed/", "Brusque"),
  municipal("Jornal de Pomerode", "https://www.jornaldepomerode.com.br/", "https://www.jornaldepomerode.com.br/feed/", "Pomerode"),
];
