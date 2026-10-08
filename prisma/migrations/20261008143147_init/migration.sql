-- ============================================================
-- Full-text em português (manual: o Prisma não gera isto)
--
-- unaccent não é IMMUTABLE; o wrapper com dicionário explícito é,
-- o que permite usá-lo em coluna gerada e em índice.
--
-- O stemmer português depende dos acentos ("vacinação" e "vacinas" -> 'vacin',
-- mas "vacinacao" -> 'vacinaca'). Por isso o texto é indexado duas vezes:
-- com acento (stemming correto) e sem acento (busca digitada sem acento).
-- news_tsquery() faz o mesmo do lado da consulta; mantenha os dois em sincronia.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $func$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $func$;

CREATE OR REPLACE FUNCTION public.news_tsquery(text) RETURNS tsquery
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $func$
    SELECT websearch_to_tsquery('portuguese'::regconfig, $1)
        || websearch_to_tsquery('portuguese'::regconfig, public.f_unaccent($1))
  $func$;

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('NACIONAL', 'ESTADUAL', 'MUNICIPAL');

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "uf" CHAR(2),
    "city" TEXT,
    "defaultCategoryId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchedAt" TIMESTAMPTZ(3),
    "lastStatus" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" CHAR(64) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" INTEGER NOT NULL,
    "uf" CHAR(2),
    "city" TEXT,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese'::regconfig, coalesce("title", '')), 'A') ||
        setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce("title", ''))), 'A') ||
        setweight(to_tsvector('portuguese'::regconfig, coalesce("summary", '')), 'B') ||
        setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce("summary", ''))), 'B')
    ) STORED,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Source_feedUrl_key" ON "Source"("feedUrl");

-- CreateIndex
CREATE INDEX "Source_active_idx" ON "Source"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Article_urlHash_key" ON "Article"("urlHash");

-- CreateIndex
CREATE INDEX "Article_publishedAt_id_idx" ON "Article"("publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Article_categoryId_publishedAt_idx" ON "Article"("categoryId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_uf_publishedAt_idx" ON "Article"("uf", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_uf_city_publishedAt_idx" ON "Article"("uf", "city", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_sourceId_idx" ON "Article"("sourceId");

-- CreateIndex
CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
