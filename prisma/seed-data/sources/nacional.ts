import type { SourceSeed } from "./index.ts";

// Fontes nacionais validadas em 08/10/2026 (scripts/validate-feeds.ts).
// Onde o veículo tem feed por editoria, usamos as editorias (categoria definida pela fonte)
// e deixamos de fora o feed geral, para não duplicar matérias com categoria aleatória.

const agenciaBrasil = (slug: string, category: string): SourceSeed => ({
  name: "Agência Brasil",
  siteUrl: "https://agenciabrasil.ebc.com.br/",
  feedUrl: `https://agenciabrasil.ebc.com.br/rss/${slug}/feed.xml`,
  scope: "NACIONAL",
  category,
});

const g1 = (slug: string, category: string): SourceSeed => ({
  name: "g1",
  siteUrl: "https://g1.globo.com/",
  feedUrl: `https://g1.globo.com/rss/g1/${slug}/`,
  scope: "NACIONAL",
  category,
});

const folha = (slug: string, category: string): SourceSeed => ({
  name: "Folha de S.Paulo",
  siteUrl: "https://www.folha.uol.com.br/",
  feedUrl: `https://feeds.folha.uol.com.br/${slug}/rss091.xml`,
  scope: "NACIONAL",
  category,
});

export const nacional: SourceSeed[] = [
  agenciaBrasil("geral", "brasil"),
  agenciaBrasil("politica", "politica"),
  agenciaBrasil("justica", "politica"),
  agenciaBrasil("economia", "economia"),
  agenciaBrasil("internacional", "mundo"),
  agenciaBrasil("saude", "saude"),
  agenciaBrasil("educacao", "educacao"),
  agenciaBrasil("esportes", "esportes"),
  agenciaBrasil("cultura", "cultura"),
  agenciaBrasil("meio-ambiente", "ciencia"),
  agenciaBrasil("direitos-humanos", "brasil"),

  g1("politica", "politica"),
  g1("economia", "economia"),
  g1("mundo", "mundo"),
  g1("tecnologia", "tecnologia"),
  g1("ciencia", "ciencia"),
  g1("meio-ambiente", "ciencia"),
  g1("saude", "saude"),
  g1("educacao", "educacao"),
  g1("pop-arte", "entretenimento"),
  {
    name: "ge",
    siteUrl: "https://ge.globo.com/",
    feedUrl: "https://ge.globo.com/rss/ge/",
    scope: "NACIONAL",
    category: "esportes",
  },

  folha("poder", "politica"),
  folha("mercado", "economia"),
  folha("mundo", "mundo"),
  folha("cotidiano", "brasil"),
  folha("esporte", "esportes"),
  folha("ilustrada", "cultura"),
  folha("equilibrioesaude", "saude"),
  folha("ciencia", "ciencia"),
  folha("ambiente", "ciencia"),
  folha("tec", "tecnologia"),
  folha("educacao", "educacao"),

  // Feeds gerais: categoria por regras de palavra-chave.
  {
    name: "UOL",
    siteUrl: "https://www.uol.com.br/",
    feedUrl: "https://rss.home.uol.com.br/index.xml",
    scope: "NACIONAL",
  },
  {
    name: "CNN Brasil",
    siteUrl: "https://www.cnnbrasil.com.br/",
    feedUrl: "https://www.cnnbrasil.com.br/feed/",
    scope: "NACIONAL",
  },
  {
    name: "BBC News Brasil",
    siteUrl: "https://www.bbc.com/portuguese",
    feedUrl: "https://feeds.bbci.co.uk/portuguese/rss.xml",
    scope: "NACIONAL",
  },
  {
    name: "Poder360",
    siteUrl: "https://www.poder360.com.br/",
    feedUrl: "https://www.poder360.com.br/feed/",
    scope: "NACIONAL",
  },
];
