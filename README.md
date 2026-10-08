# news-sys

Agregador de notícias de veículos brasileiros a partir de feeds RSS, publicado em **https://news.neojr.com**.

O site mostra só **título, resumo curto (até ~280 caracteres), imagem (hotlink), fonte, data e categoria**. Cada notícia leva à página original no site do veículo. O texto completo nunca é republicado. A lista de fontes e o contato para pedidos de remoção ficam em [`/fontes`](https://news.neojr.com/fontes).

## Stack

| Camada | Tecnologia |
|---|---|
| Web + API | Next.js 16 (App Router, Server Components, `output: "standalone"`) |
| Banco | PostgreSQL 16, busca full-text em português |
| ORM | Prisma 7 com driver adapter `@prisma/adapter-pg` |
| Coleta | Worker TypeScript (`rss-parser`, `cheerio`), mesma imagem Docker do site |
| Estilo | Tailwind CSS 4 |
| Deploy | Docker Compose atrás do Nginx Proxy Manager |

As versões estão fixadas em `package.json` (`.npmrc` com `save-exact=true`). Atenção: a tag `latest` do pacote `prisma` aponta para uma release candidate da v8, então atualize sempre com versão explícita.

## Desenvolvimento local

Requisitos: Node 22.12+ (WSL/Linux). Não precisa de Docker para desenvolver: o Postgres 16 roda embutido via `embedded-postgres`.

```bash
npm install                 # também roda `prisma generate`
cp .env.example .env        # ajuste DATABASE_URL (porta 54329 no dev)
npm run db:dev              # Postgres de dev em primeiro plano (dados em .devdb/)

# em outro terminal
npm run db:migrate          # aplica as migrations
npm run db:seed             # categorias e fontes (idempotente)
npm run dev                 # http://localhost:3000
```

| Script | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:dev` | Sobe o Postgres embutido de desenvolvimento |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Seed idempotente de categorias e fontes |
| `npm run db:generate` | Regera o Prisma Client em `src/generated/prisma` |
| `npm run worker` | Worker de coleta em loop (intervalo `WORKER_INTERVAL_MINUTES`) |
| `npm run worker:once` | Um único ciclo de coleta e sai |
| `npm run feeds:validate` | Valida de verdade todos os feeds do seed (aceita um JSON de candidatas) |
| `npm test` | Testes unitários (`node:test`): normalização, SSRF, robots.txt, categorias |

### Variáveis de ambiente

Veja `.env.example`. Regras:

- **Nunca** crie `.env.production`: o Next carrega esse arquivo sozinho e ele acaba dentro da imagem.
- No servidor use `.env.deploy`, copiado como `.env` com permissão `600`.
- A senha do Postgres deve ser só alfanumérica.
- `SHADOW_DATABASE_URL` é opcional e só serve em dev, para `prisma migrate diff --from-migrations`.
- `CATEGORY_RULES_PATH` é opcional (padrão `config/category-rules.json`).

## Estrutura

```
prisma/
  schema.prisma              # modelos Category, Source, Article, JobRun
  migrations/                # SQL do Prisma + SQL manual do full-text
  seed.ts                    # seed idempotente
  seed-data/
    categories.ts
    sources/                 # um arquivo por UF; nova UF = novo arquivo + entrada no index.ts
prisma.config.ts             # connection string (Prisma 7) e comando de seed
config/category-rules.json   # regras de palavra-chave -> categoria (worker)
scripts/dev-db.ts            # Postgres embutido para dev
src/
  app/                       # páginas e rotas de API
  components/
  lib/                       # db, filtros, consultas, segurança
  worker/                    # coleta de feeds
```

## Banco e busca full-text

- `Article.searchVector` é uma **coluna gerada** (`tsvector`): título com peso A e resumo com peso B, config `portuguese`. O Prisma a mapeia como `Unsupported("tsvector")` com `@default(dbgenerated())`, para o `migrate` não tentar alterá-la.
- O stemmer português depende de acentos: "vacinação" e "vacinas" viram `vacin`, mas "vacinacao" vira `vacinaca`. Por isso cada texto é indexado **com e sem acento** (via `f_unaccent`, um wrapper `IMMUTABLE` de `unaccent`).
- Toda consulta deve usar a função `news_tsquery(q)`, que aplica a mesma regra do lado da busca. Ela aceita a sintaxe do `websearch_to_tsquery`: `"frase exata"`, `-excluir`, `or`.
- Sempre consulte com `$queryRaw` parametrizado, nunca concatenando strings.
- O adapter `pg` do Prisma envia `DateTime` sem offset. Por isso a conexão força `TimeZone=UTC` (`src/lib/db.ts` e `prisma/seed.ts`). Sem isso, um Postgres com outro fuso grava `timestamptz` deslocado.
- Limitação conhecida: singular e plural irregulares ("eleição" × "eleições") não se encontram.

Se alterar a expressão de `searchVector`, altere também `news_tsquery` na mesma migration.

## Worker de coleta

`src/worker/` roda no mesmo repositório e na mesma imagem do site, com outro comando de entrada.

**Ciclo** (a cada `WORKER_INTERVAL_MINUTES`, padrão 20; até `WORKER_CONCURRENCY` feeds em paralelo, padrão 3):

1. Para cada fonte ativa, faz um GET condicional (`If-None-Match` / `If-Modified-Since`), com timeout de 10 s, limite de 5 MB e User-Agent `NeoJrNewsBot/1.0 (+https://news.neojr.com/fontes)`.
2. Normaliza cada item:
   - URL canônica: sem `utm_*`, `fbclid`, `gclid` e fragmento, e com redirecionadores `…/*https://…` desembrulhados.
   - Deduplicação por SHA-256 da URL.
   - Título e resumo em texto puro; o resumo é cortado em até 280 caracteres, em limite de palavra.
   - **O `content:encoded` nunca é lido.**
3. Descarta itens de domínios que não são de fontes cadastradas, como anúncios e links de terceiros.
4. Escolhe a imagem nesta ordem: `media:content`/`media:thumbnail` → `enclosure` de imagem → primeira `<img>` da description → `og:image` lido apenas do `<head>` da página, respeitando o `robots.txt`.
   - Busca no máximo 25 páginas por feed em cada ciclo; o excedente fica para o ciclo seguinte.
5. Define a categoria: categoria padrão da fonte → regras de `config/category-rules.json` (palavras do título) → `brasil` para fontes nacionais ou `regional` para estaduais e municipais.
6. Herda a localização (`uf`/`city`) da fonte.
7. Trata as datas:
   - Sem data, usa a hora da coleta.
   - Se o feed inteiro estiver horas no futuro (ex.: UOL, que publica horário UTC rotulado como `-0300`), desloca o feed em horas cheias.
   - O que ainda ficar no futuro vira "agora".

**Robustez**
- A falha de um feed não derruba o ciclo.
- Cada falha incrementa `consecutiveFailures` e grava `lastStatus` (`http_404`, `timeout`, `parse_error`…).
- Na 10ª falha seguida o feed é desativado e o evento `feed_deactivated` é logado.

**Retenção**: uma vez por dia (controlada pela tabela `JobRun`), apaga artigos com mais de `RETENTION_DAYS` dias (padrão 90).

**SIGTERM/SIGINT**: termina os feeds em andamento e sai sem começar novos.

**Logs**: um JSON por linha no stdout, pronto para o Wazuh. Eventos:
- `worker_start`, `feed_done`, `feed_failed`, `feed_deactivated`, `feed_clock_skew`
- `og_image_failed`, `cycle_done`, `retention_done`, `worker_stopping`, `worker_stopped`

```json
{"ts":"2026-10-08T15:26:28.041Z","level":"info","event":"cycle_done","feeds":44,"ok":44,"failed":0,"newArticles":272,"durationMs":54040}
```

### Segurança (SSRF)

`src/worker/safe-fetch.ts` faz toda requisição do worker:

- aceita só `http`/`https`, nas portas 80/443, sem credenciais e sem IP literal na URL;
- exige host igual ou subdomínio de um host de `feedUrl`/`siteUrl` das fontes cadastradas;
- verifica o IP resolvido **na hora da conexão** (`lookup` do socket) e recusa faixas privadas, loopback, link-local, CGNAT, multicast e IPv4 mapeado em IPv6, o que impede DNS rebinding;
- segue redirecionamentos manualmente (até 5), revalidando cada salto;
- limita o tamanho depois da descompressão (gzip/deflate/br), o que protege contra bombas de compressão.

## Fontes

As fontes ficam em `prisma/seed-data/sources/` (um arquivo por UF). O seed faz upsert por `feedUrl` e **desativa** (sem apagar) as fontes que saíram da lista.

Para adicionar uma UF:

1. Crie `prisma/seed-data/sources/<uf>.ts` seguindo `am.ts`.
2. Inclua a lista em `prisma/seed-data/sources/index.ts`.
3. Rode `npm run feeds:validate`. Ele baixa cada feed, faz o parse, confere a data do item mais recente e o percentual de imagens, e abre o link do primeiro item.
4. Rode `npm run db:seed`.

Validadas em 08/10/2026 (44 feeds):

| Fonte | Escopo | Feeds | Categoria |
|---|---|---|---|
| Agência Brasil | Nacional | 11 editorias | da editoria |
| g1 | Nacional | 9 editorias | da editoria |
| ge | Nacional | 1 | Esportes |
| Folha de S.Paulo | Nacional | 11 editorias | da editoria (imagens via `og:image`) |
| UOL | Nacional | 1 (geral) | regras |
| CNN Brasil | Nacional | 1 (geral) | regras |
| BBC News Brasil | Nacional | 1 | regras |
| Poder360 | Nacional | 1 | regras |
| g1 Amazonas, D24AM, Em Tempo, Amazonas Atual, Amazônia Real, Amazonas Notícias, BNC Amazonas | AM | 1 cada | regras → Regional |
| Prefeitura de Manaus | AM / Manaus | 1 | regras → Regional |

Não entraram:

| Fonte | Motivo |
|---|---|
| A Crítica | nenhum feed encontrado (404 em `/feed`, `/rss`, `/rss.xml`; a home não anuncia RSS) |
| CNN Brasil (editorias) | 404 ou XML inválido; usamos o feed geral |
| UOL (editorias em `rss.uol.com.br`) | formato não reconhecido como RSS; usamos o feed geral |
| g1 Brasil, g1 Ciência e Saúde | feeds desatualizados (sem itens novos há anos) |
| Portal do Holanda | o feed funciona, mas os links dos itens (`/articles/<id>`) dão 404 |
| Revista Cenarium, Portal Marcos Santos | 403 para o nosso robô no feed |
| Agência Amazonas | feed parado há cerca de 20 dias |
| CM Manaus | XML inválido |
| Feeds gerais de Agência Brasil, g1 e Folha | ok, mas ficaram de fora para não duplicar as editorias com categoria aleatória |

## Status do projeto

- [x] **Fase 1:** plano (estrutura e schema)
- [x] **Fase 2:** scaffold, Prisma 7, migration com full-text, seed de categorias
- [x] **Fase 3:** worker de coleta e seed de fontes validadas
- [ ] **Fase 4:** interface (busca, filtros, paginação, `/fontes`)
- [ ] **Fase 5:** Docker Compose e `DEPLOY.md`
- [ ] **Fase 6:** verificação ponta a ponta
