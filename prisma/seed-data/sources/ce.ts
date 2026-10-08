import type { SourceSeed } from "./index.ts";

// Ceará — validadas em 08/10/2026 (scripts/validate-feeds.ts).
// Fora por enquanto: Diário do Nordeste (itens sem data), O Povo (descrição vazia e só logo
// como imagem), Tribuna do Ceará (timeout),
// Ceará Agora (403 para robôs).

const estadual = (name: string, siteUrl: string, feedUrl: string): SourceSeed => ({
  name,
  siteUrl,
  feedUrl,
  scope: "ESTADUAL",
  uf: "CE",
});

export const ce: SourceSeed[] = [
  estadual("g1 Ceará", "https://g1.globo.com/ce/ceara/", "https://g1.globo.com/rss/g1/ce/ceara/"),
  estadual("CN7", "https://cn7.com.br/", "https://cn7.com.br/feed/"),
  estadual("O Estado CE", "https://oestadoce.com.br/", "https://oestadoce.com.br/feed/"),
  estadual("Governo do Ceará", "https://www.ce.gov.br/", "https://www.ce.gov.br/feed/"),
  {
    name: "Prefeitura de Fortaleza",
    siteUrl: "https://www.fortaleza.ce.gov.br/",
    feedUrl: "https://www.fortaleza.ce.gov.br/noticias?format=feed&type=rss",
    scope: "MUNICIPAL",
    uf: "CE",
    city: "Fortaleza",
  },
];
