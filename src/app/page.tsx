import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArticleCard } from "@/components/ArticleCard";
import { CategoryBar } from "@/components/CategoryBar";
import { EmptyState } from "@/components/EmptyState";
import { LoadMore } from "@/components/LoadMore";
import { SiteHeader } from "@/components/SiteHeader";
import { getCategories, getLocations, listArticles, resolveFilters } from "@/lib/articles";
import { filtersToSearch, parseFilters } from "@/lib/filters";
import { clientIp, rateLimit, SEARCH_LIMIT } from "@/lib/rate-limit";
import { UF_NAMES } from "@/lib/ufs";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseFilters(await searchParams);
  return q ? { title: `Busca: ${q}`, robots: { index: false } } : {};
}

export default async function Home({ searchParams }: Props) {
  const raw = parseFilters(await searchParams);
  const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
  const filters = resolveFilters(raw, categories, locations);

  let limited = false;
  if (filters.q) {
    const ip = clientIp(await headers());
    limited = !rateLimit(`search:${ip}`, SEARCH_LIMIT.limit, SEARCH_LIMIT.windowMs).ok;
  }
  const page = limited ? null : await listArticles(filters, raw.cursor);

  const place = filters.cidade ?? (filters.uf ? UF_NAMES[filters.uf] : undefined);
  const categoryName = categories.find((c) => c.slug === filters.cat)?.name;
  const heading = filters.q
    ? `Resultados para “${filters.q}”`
    : [categoryName ?? "Últimas notícias", place].filter(Boolean).join(" · ");
  const subtitle = filters.q ? [categoryName, place].filter(Boolean).join(" · ") : null;

  return (
    <>
      <SiteHeader filters={filters} locations={locations} />
      <CategoryBar filters={filters} categories={categories} />
      <main className="mx-auto max-w-4xl px-4">
        <div className="pt-5 pb-1">
          <h1 className="text-xl font-bold tracking-tight">{heading}</h1>
          {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
          {raw.cursor && (
            <Link href={"/" + filtersToSearch(filters)} className="text-sm text-blue-700 underline dark:text-blue-400">
              Voltar ao início da lista
            </Link>
          )}
        </div>

        {limited ? (
          <EmptyState title="Muitas buscas seguidas" showReset={false}>
            Aguarde um minuto e tente de novo.
          </EmptyState>
        ) : page && page.items.length > 0 ? (
          <>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {page.items.map((item) => (
                <li key={item.id}>
                  <ArticleCard item={item} />
                </li>
              ))}
            </ul>
            <LoadMore
              key={filtersToSearch({ ...filters, cursor: raw.cursor })}
              search={filtersToSearch(filters).slice(1)}
              initialCursor={page.nextCursor}
            />
          </>
        ) : (
          <EmptyState title={filters.q ? "Nenhuma notícia encontrada" : "Ainda não há notícias aqui"}>
            {filters.q ? (
              <p>Tente outras palavras, remova filtros ou use termos mais gerais.</p>
            ) : (
              <p>As notícias são coletadas a cada 20 minutos. Volte em instantes ou escolha outro filtro.</p>
            )}
          </EmptyState>
        )}
      </main>
    </>
  );
}
