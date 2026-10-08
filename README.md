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
| `npm run build:worker` | Empacota `dist/worker.mjs` e `dist/seed.mjs` com esbuild (usado no Dockerfile) |
| `npm run feeds:validate` | Valida de verdade todos os feeds do seed (aceita um JSON de candidatas) |
| `npm test` | Testes unitários (`node:test`): normalização, SSRF, robots.txt, categorias, filtros, cursor, rate limit |

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
   - Quando o título é só um "chapéu" e a manchete vem na description, a description vira o título. Há dois casos: chapéu em maiúsculas (ex.: `AO VIVO`) e nome do colunista ou do blog em links de `/colunas/` ou `/blogs/` (ex.: UOL com `Mariana Barbosa`).
   - **O `content:encoded` nunca é lido.**
3. Descarta itens de domínios que não são de fontes cadastradas, como anúncios e links de terceiros.
4. Escolhe a imagem nesta ordem: `media:content`/`media:thumbnail` → `enclosure` de imagem → primeira `<img>` da description → `og:image` lido apenas do `<head>` da página, respeitando o `robots.txt`.
   - Busca no máximo 25 páginas por feed em cada ciclo; o excedente fica para o ciclo seguinte.
   - Descarta imagens genéricas (nome do arquivo com `logo`, `preview-share` etc.); nesse caso o card mostra o placeholder.
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

Validadas em 08/10/2026 (57 feeds):

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
| g1 Ceará, CN7, O Estado CE, Governo do Ceará | CE | 1 cada | regras → Regional |
| Prefeitura de Fortaleza | CE / Fortaleza | 1 | regras → Regional |
| g1 Santa Catarina, NSC Total, ND+, SCC10, Portal Making Of, OCP News | SC | 1 cada | regras → Regional |
| O Município | SC / Brusque | 1 | regras → Regional |
| Jornal de Pomerode | SC / Pomerode | 1 | regras → Regional |

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
| Diário do Nordeste | o único feed geral vem com a maioria dos itens sem data |
| O Povo | descrição vazia, quase só matéria de agência e `og:image` com o logo |
| Tribuna do Ceará | timeout |
| Ceará Agora, O Município Blumenau | 403 para o nosso robô no feed |
| Agência de Notícias SC | o servidor manda cabeçalho HTTP inválido (CSP em várias linhas), recusado pelo parser do Node |
| Diarinho, Floripa News, prefeituras de Florianópolis e Joinville | sem feed ou XML inválido |
| Feeds gerais de Agência Brasil, g1 e Folha | ok, mas ficaram de fora para não duplicar as editorias com categoria aleatória |

## Interface

Página única (`/`), renderizada no servidor e responsiva (mobile primeiro). O tema claro ou escuro segue o `prefers-color-scheme`. De cima para baixo:

1. Logo, que leva para `/`.
2. Barra de busca.
3. Seletor de localização.
4. Barra de categorias: rolagem horizontal no celular; no desktop quebra linha.
5. Lista de cards: miniatura 4:3 à esquerda; à direita título, resumo e a linha "Fonte · há 2 h · Categoria".

**Filtros na URL**, para links compartilháveis: `?q=&uf=&cidade=&cat=`.
- Todos são validados em `src/lib/filters.ts` e `resolveFilters`. Valores inexistentes são ignorados.
- `q` é limitado a 100 caracteres.

| Filtro | Efeito |
|---|---|
| sem `uf` ("Brasil (nacional)") | todas as notícias, nacionais e regionais |
| `uf=AM` | só notícias de fontes do Amazonas (estaduais e municipais) |
| `uf=AM&cidade=Manaus` | só fontes municipais de Manaus |
| `cat=<slug>` | categoria; combina com os demais filtros |
| `q=<texto>` | busca full-text; ordena por relevância + recência |

**Comportamento da interface**
- **Paginação**: botão "Carregar mais".
  - Com JavaScript, busca `/api/articles` e anexa os cards na mesma página.
  - Sem JavaScript, é um link `?cursor=…` que abre a página seguinte.
  - O cursor é keyset na listagem e offset na busca (até 200 resultados).
- **Busca e seletor de localização**: são formulários GET, então funcionam sem JavaScript; com JS, o seletor navega ao trocar de opção.
- **Cards**:
  - Cada card leva à matéria original (`target="_blank" rel="noopener noreferrer"`).
  - Imagens por hotlink: `<img loading="lazy" referrerPolicy="no-referrer">`, sem `next/image`, que faria proxy ou cópia. Se a imagem faltar ou falhar, aparece `public/placeholder.svg`.
- **Estados**: há telas para lista vazia, busca sem resultado, rate limit, erro (`error.tsx`) e 404.
- **`/fontes`**: lista os veículos ativos agrupados por escopo, com link para cada site e o contato de remoção (`CONTACT_EMAIL`).

## Segurança da aplicação

- **XSS**:
  - Nenhum `dangerouslySetInnerHTML`.
  - Os textos dos feeds são gravados como texto puro e o React os escapa na renderização.
  - Links e imagens passam por `safeHref`, que aceita só `http(s)`.
- **CSP com nonce por requisição** (`src/proxy.ts`):
  - `script-src 'self' 'nonce-…' 'strict-dynamic'` e `style-src 'self' 'nonce-…'`, sem `unsafe-inline`.
  - `img-src 'self' https: data:` e `frame-ancestors 'none'`; em produção também `upgrade-insecure-requests`.
  - O layout lê `headers()`, então todas as páginas são dinâmicas e recebem o nonce.
- **Demais cabeçalhos** (`next.config.ts`):
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` e `Permissions-Policy` restritiva.
  - HSTS em produção.
  - Na API, `Content-Security-Policy: default-src 'none'`.
- **Rate limit** em memória por IP (`src/lib/rate-limit.ts`):
  - Busca: 30 por minuto, valendo para a página e a API juntas.
  - `/api/articles`: 120 por minuto.
  - O IP vem de `X-Real-IP`, definido pelo Nginx Proxy Manager. O `X-Forwarded-For` não é usado porque o cliente pode forjá-lo.
  - O estado vale para um único processo do Next.

## Docker e deploy

O passo a passo de produção (DNS, Nginx Proxy Manager, segredos, backup) fica num `DEPLOY.md` local, fora do repositório (está no `.gitignore` porque o repositório é público).

`Dockerfile` multi-stage (`node:22.23.2-bookworm-slim`), com estes estágios:

| Estágio | Conteúdo | Uso |
|---|---|---|
| `deps` | `npm ci` | cache de dependências |
| `builder` | `prisma generate`, `next build` (standalone), `npm run build:worker` (esbuild → `dist/worker.mjs`, `dist/seed.mjs`) | só build |
| `runner` (cerca de 450 MB) | standalone do Next + `dist/` + `config/`; usuário `nextjs` (uid 1001) | `news-app` (`node server.js`) e `news-worker` (`node dist/worker.mjs`) |
| `migrator` (cerca de 710 MB) | só o Prisma CLI 7.10.0, schema, migrations e `dist/seed.mjs`; usuário `node` | `news-migrate` |

O worker e o seed são empacotados com esbuild em arquivos únicos, então rodam sem `tsx` e sem o `node_modules` completo.

`docker-compose.yml` (projeto `news-sys`):

| Serviço | Container | Detalhes |
|---|---|---|
| `news-db` | `news-sys-db` | `postgres:16-alpine`, 256 MB, volume nomeado, healthcheck, só na rede interna |
| `news-migrate` | `news-sys-migrate` | one-shot: `prisma migrate deploy` + seed idempotente |
| `news-app` | `news-sys-app` | 384 MB, porta 3000 sem publicar no host, redes `news-internal` e `npm_default` (externa) |
| `news-worker` | `news-sys-worker` | 256 MB, redes `news-internal` e `news-egress` (saída para a internet) |

- `news-app` e `news-worker` só sobem depois de `news-migrate` terminar com sucesso.
- O app tem healthcheck em `/api/health`; o worker, um arquivo de heartbeat gravado a cada ciclo.
- Os dois rodam com sistema de arquivos somente leitura, `cap_drop: ALL` e `no-new-privileges`.
- Logs `json-file` com rotação (10 MB × 3).

Para testar o compose localmente, crie a rede do proxy uma vez (`docker network create npm_default`) e passe um arquivo de variáveis com `POSTGRES_*` e `CONTACT_EMAIL`:

```bash
docker compose --env-file /caminho/teste.env up -d --build
```

## Status do projeto

- [x] **Fase 1:** plano (estrutura e schema)
- [x] **Fase 2:** scaffold, Prisma 7, migration com full-text, seed de categorias
- [x] **Fase 3:** worker de coleta e seed de fontes validadas
- [x] **Fase 4:** interface (busca, filtros, paginação, `/fontes`)
- [x] **Fase 5:** Docker Compose e guia de deploy
- [x] **Fase 6:** verificação ponta a ponta em produção (https://news.neojr.com)

## Limitações conhecidas

- A busca não junta singular e plural com acento (`eleição` não encontra `eleições`). O stemmer `portuguese` do Postgres não trata esse caso. O dicionário Hunspell resolveria, mas foi descartado por custo de memória.
- A busca pagina por offset até 200 resultados. A listagem normal usa cursor, sem esse limite.
- O rate limit fica em memória, no processo do app. É suficiente para uma instância só e zera quando o container reinicia.
- As imagens são hotlink: se o veículo bloquear ou apagar a imagem, o card mostra o placeholder.
- A CSP com nonce bloqueia scripts injetados pelo CDN. Se o site estiver atrás do Cloudflare, desligue Email Obfuscation, Rocket Loader e a injeção automática do Web Analytics.
