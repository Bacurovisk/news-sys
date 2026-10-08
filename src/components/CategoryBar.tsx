import Link from "next/link";
import { filtersToSearch, type Filters } from "@/lib/filters";

type Props = { filters: Filters; categories: { slug: string; name: string }[] };

export function CategoryBar({ filters, categories }: Props) {
  const items = [{ slug: undefined as string | undefined, name: "Todas" }, ...categories];
  return (
    <nav aria-label="Categorias" className="border-b border-neutral-200 dark:border-neutral-800">
      <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((c) => {
          const active = (filters.cat ?? undefined) === c.slug;
          return (
            <li key={c.slug ?? "todas"} className="shrink-0">
              <Link
                href={"/" + filtersToSearch({ ...filters, cat: c.slug })}
                aria-current={active ? "page" : undefined}
                className={
                  "block rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors " +
                  (active
                    ? "bg-blue-700 font-medium text-white dark:bg-blue-500 dark:text-neutral-950"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800")
                }
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
