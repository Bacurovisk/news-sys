"use client";

import { useRouter } from "next/navigation";
import { filtersToSearch, type Filters } from "@/lib/filters";
import { UF_NAMES } from "@/lib/ufs";

type Props = {
  filters: Filters;
  locations: { uf: string; cities: string[] }[];
};

const selectClass =
  "h-10 max-w-44 rounded-full border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-blue-400";

// Com JavaScript navega ao trocar; sem JavaScript, o formulário GET + botão faz o mesmo.
export function LocationSelect({ filters, locations }: Props) {
  const router = useRouter();
  const cities = locations.find((l) => l.uf === filters.uf)?.cities ?? [];

  const go = (uf: string, cidade: string) => {
    router.push("/" + filtersToSearch({ ...filters, uf: uf || undefined, cidade: cidade || undefined }));
  };

  return (
    <form action="/" method="get" className="flex items-center gap-2">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.cat && <input type="hidden" name="cat" value={filters.cat} />}
      <label htmlFor="uf" className="sr-only">
        Localização
      </label>
      <select id="uf" name="uf" value={filters.uf ?? ""} onChange={(e) => go(e.target.value, "")} className={selectClass}>
        <option value="">Brasil (nacional)</option>
        {locations.map((l) => (
          <option key={l.uf} value={l.uf}>
            {UF_NAMES[l.uf] ?? l.uf}
          </option>
        ))}
      </select>
      {filters.uf && cities.length > 0 && (
        <>
          <label htmlFor="cidade" className="sr-only">
            Cidade
          </label>
          <select
            id="cidade"
            name="cidade"
            value={filters.cidade ?? ""}
            onChange={(e) => go(filters.uf!, e.target.value)}
            className={selectClass}
          >
            <option value="">Todo o estado</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </>
      )}
      <noscript>
        <button type="submit" className="h-10 rounded-full border border-neutral-300 px-3 text-sm dark:border-neutral-700">
          Filtrar
        </button>
      </noscript>
    </form>
  );
}
