import "server-only";
import { Prisma } from "@/generated/prisma/client.ts";
import { decodeCursor, encodeCursor, MAX_SEARCH_OFFSET } from "./cursor";
import { prisma } from "./db";
import type { Filters } from "./filters";

export const PAGE_SIZE = 20;

export type ArticleItem = {
  id: number;
  url: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string; // ISO, serializável para o client
  sourceName: string;
  categoryName: string;
  categorySlug: string;
};

export type ArticlePage = { items: ArticleItem[]; nextCursor: string | null };

export type Location = { uf: string; cities: string[] };

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } });
}

/** UFs e cidades com fontes ativas. */
export async function getLocations(): Promise<Location[]> {
  const rows = await prisma.source.findMany({
    where: { active: true, uf: { not: null } },
    select: { uf: true, city: true },
    distinct: ["uf", "city"],
    orderBy: [{ uf: "asc" }, { city: "asc" }],
  });
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = map.get(r.uf!) ?? new Set<string>();
    if (r.city) set.add(r.city);
    map.set(r.uf!, set);
  }
  return [...map].map(([uf, cities]) => ({ uf, cities: [...cities].sort((a, b) => a.localeCompare(b, "pt-BR")) }));
}

/** Descarta UF/cidade/categoria que não existem (filtros vindos da URL). */
export function resolveFilters(
  f: Filters,
  categories: { id: number; slug: string }[],
  locations: Location[],
): Filters & { categoryId?: number } {
  const loc = f.uf ? locations.find((l) => l.uf === f.uf) : undefined;
  const cidade = loc && f.cidade ? loc.cities.find((c) => c.toLowerCase() === f.cidade!.toLowerCase()) : undefined;
  const category = f.cat ? categories.find((c) => c.slug === f.cat) : undefined;
  return {
    q: f.q,
    uf: loc?.uf,
    cidade,
    cat: category?.slug,
    categoryId: category?.id,
  };
}

type Resolved = ReturnType<typeof resolveFilters>;

export async function listArticles(f: Resolved, rawCursor?: string): Promise<ArticlePage> {
  return f.q ? searchArticles(f, rawCursor) : latestArticles(f, rawCursor);
}

async function latestArticles(f: Resolved, rawCursor?: string): Promise<ArticlePage> {
  const cursor = decodeCursor(rawCursor);
  const where: Prisma.ArticleWhereInput = {
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.uf ? { uf: f.uf } : {}),
    ...(f.cidade ? { city: f.cidade } : {}),
    ...(cursor?.kind === "keyset"
      ? {
          OR: [
            { publishedAt: { lt: cursor.publishedAt } },
            { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const rows = await prisma.article.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      url: true,
      title: true,
      summary: true,
      imageUrl: true,
      publishedAt: true,
      source: { select: { name: true } },
      category: { select: { name: true, slug: true } },
    },
  });

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      summary: r.summary,
      imageUrl: r.imageUrl,
      publishedAt: r.publishedAt.toISOString(),
      sourceName: r.source.name,
      categoryName: r.category.name,
      categorySlug: r.category.slug,
    })),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({ kind: "keyset", publishedAt: last.publishedAt, id: last.id })
        : null,
  };
}

type SearchRow = {
  id: number;
  url: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: Date;
  sourceName: string;
  categoryName: string;
  categorySlug: string;
};

// Score = relevância (ts_rank_cd normalizado, 0..1) + recência (1 agora, 0,5 com 1 dia, ~0,12 com 7 dias).
async function searchArticles(f: Resolved, rawCursor?: string): Promise<ArticlePage> {
  const cursor = decodeCursor(rawCursor);
  const offset = cursor?.kind === "offset" ? cursor.offset : 0;

  const conditions = [Prisma.sql`a."searchVector" @@ q.query`];
  if (f.categoryId) conditions.push(Prisma.sql`a."categoryId" = ${f.categoryId}`);
  if (f.uf) conditions.push(Prisma.sql`a.uf = ${f.uf}`);
  if (f.cidade) conditions.push(Prisma.sql`a.city = ${f.cidade}`);

  const rows = await prisma.$queryRaw<SearchRow[]>`
    SELECT a.id, a.url, a.title, a.summary, a."imageUrl", a."publishedAt",
           s.name AS "sourceName", c.name AS "categoryName", c.slug AS "categorySlug"
    FROM "Article" a
    CROSS JOIN news_tsquery(${f.q}) AS q(query)
    JOIN "Source" s ON s.id = a."sourceId"
    JOIN "Category" c ON c.id = a."categoryId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ts_rank_cd(a."searchVector", q.query, 32)
             + 1.0 / (1 + EXTRACT(EPOCH FROM (now() - a."publishedAt")) / 86400) DESC,
             a.id DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
  `;

  const page = rows.slice(0, PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  return {
    items: page.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() })),
    nextCursor:
      rows.length > PAGE_SIZE && nextOffset <= MAX_SEARCH_OFFSET
        ? encodeCursor({ kind: "offset", offset: nextOffset })
        : null,
  };
}

/** Fontes para a página /fontes, agrupadas por veículo. */
export async function getSourcesForPage() {
  const sources = await prisma.source.findMany({
    where: { active: true },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
    select: {
      name: true,
      siteUrl: true,
      scope: true,
      uf: true,
      city: true,
      defaultCategory: { select: { name: true } },
    },
  });
  const byName = new Map<
    string,
    { name: string; siteUrl: string; scope: string; uf: string | null; city: string | null; sections: string[]; feeds: number }
  >();
  for (const s of sources) {
    const key = `${s.name}|${s.uf ?? ""}|${s.city ?? ""}`;
    const entry = byName.get(key) ?? {
      name: s.name,
      siteUrl: s.siteUrl,
      scope: s.scope,
      uf: s.uf,
      city: s.city,
      sections: [],
      feeds: 0,
    };
    entry.feeds++;
    if (s.defaultCategory && !entry.sections.includes(s.defaultCategory.name)) entry.sections.push(s.defaultCategory.name);
    byName.set(key, entry);
  }
  return [...byName.values()];
}
