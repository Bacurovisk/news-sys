// Filtros da listagem, vindos da URL (?q=&uf=&cidade=&cat=&cursor=).
// Tudo é validado aqui; o resto do código só recebe valores confiáveis.
export const MAX_QUERY_LENGTH = 100;

export type Filters = {
  q?: string;
  uf?: string;
  cidade?: string;
  cat?: string;
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function first(params: RawParams, key: string): string | undefined {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s ?? undefined;
}

export function parseFilters(params: RawParams): Filters & { cursor?: string } {
  const q = first(params, "q")
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const uf = first(params, "uf")?.trim().toUpperCase();
  const cidade = first(params, "cidade")?.trim().slice(0, 80);
  const cat = first(params, "cat")?.trim().toLowerCase();
  const cursor = first(params, "cursor")?.trim().slice(0, 200);

  return {
    q: q || undefined,
    uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : undefined,
    cidade: uf && cidade ? cidade : undefined,
    cat: cat && /^[a-z0-9-]{1,40}$/.test(cat) ? cat : undefined,
    cursor: cursor || undefined,
  };
}

/** Monta a query string de uma URL de listagem, omitindo valores vazios. */
export function filtersToSearch(f: Filters & { cursor?: string }): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.uf) p.set("uf", f.uf);
  if (f.cidade) p.set("cidade", f.cidade);
  if (f.cat) p.set("cat", f.cat);
  if (f.cursor) p.set("cursor", f.cursor);
  const s = p.toString();
  return s ? `?${s}` : "";
}
