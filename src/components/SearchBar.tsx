import { MAX_QUERY_LENGTH, type Filters } from "@/lib/filters";

// Formulário GET simples: funciona sem JavaScript e mantém os demais filtros.
export function SearchBar({ filters }: { filters: Filters }) {
  return (
    <form action="/" method="get" role="search" className="relative w-full">
      <label htmlFor="q" className="sr-only">
        Buscar notícias
      </label>
      <input
        key={filters.q ?? ""}
        id="q"
        name="q"
        type="search"
        defaultValue={filters.q}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Buscar notícias"
        autoComplete="off"
        enterKeyHint="search"
        className="h-10 w-full rounded-full border border-neutral-300 bg-white pr-11 pl-4 text-sm outline-none placeholder:text-neutral-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-400 dark:focus:border-blue-400"
      />
      {filters.uf && <input type="hidden" name="uf" value={filters.uf} />}
      {filters.cidade && <input type="hidden" name="cidade" value={filters.cidade} />}
      {filters.cat && <input type="hidden" name="cat" value={filters.cat} />}
      <button
        type="submit"
        className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
        aria-label="Buscar"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
