import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { getLocations, getSourcesForPage } from "@/lib/articles";
import { safeHref } from "@/lib/safe-url";
import { UF_NAMES } from "@/lib/ufs";

export const metadata: Metadata = {
  title: "Fontes",
  description: "Veículos cujos feeds RSS são agregados pelo neojr news e contato para pedidos de remoção.",
};

const SCOPE_LABEL: Record<string, string> = { NACIONAL: "Nacionais", ESTADUAL: "Estaduais", MUNICIPAL: "Municipais" };

export default async function FontesPage() {
  const [sources, locations] = await Promise.all([getSourcesForPage(), getLocations()]);
  const contact = process.env.CONTACT_EMAIL;
  const groups = ["NACIONAL", "ESTADUAL", "MUNICIPAL"]
    .map((scope) => ({ scope, items: sources.filter((s) => s.scope === scope) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <SiteHeader filters={{}} locations={locations} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Fontes</h1>
        <div className="mt-3 space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            O neojr news lê os feeds RSS públicos dos veículos abaixo e mostra apenas o título, um trecho curto do
            resumo, a imagem de destaque (carregada direto do site do veículo) e o link. Ao clicar, você vai para a
            matéria completa no site original. Não republicamos o texto das notícias.
          </p>
          <p>
            Nosso robô se identifica como <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">NeoJrNewsBot/1.0</code>,
            consulta cada feed no máximo a cada 20 minutos e respeita o <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">robots.txt</code>.
          </p>
        </div>

        <section aria-labelledby="remocao" className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 id="remocao" className="font-semibold">
            Pedidos de remoção
          </h2>
          <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            É responsável por um destes veículos e não quer seu conteúdo listado aqui, ou quer corrigir algo?{" "}
            {contact ? (
              <>
                Escreva para{" "}
                <a href={`mailto:${contact}`} className="font-medium text-blue-700 underline dark:text-blue-400">
                  {contact}
                </a>{" "}
                informando o site e, se for o caso, os links. Atendemos o pedido assim que possível.
              </>
            ) : (
              "Entre em contato com o responsável pelo site."
            )}
          </p>
        </section>

        {groups.map((g) => (
          <section key={g.scope} className="mt-8" aria-labelledby={`g-${g.scope}`}>
            <h2 id={`g-${g.scope}`} className="text-lg font-semibold">
              {SCOPE_LABEL[g.scope]}
            </h2>
            <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
              {g.items.map((s) => {
                const href = safeHref(s.siteUrl);
                return (
                  <li key={`${s.name}-${s.uf}-${s.city}`} className="py-3">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                        {s.name}
                      </a>
                    ) : (
                      <span className="font-medium">{s.name}</span>
                    )}
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {[s.city, s.uf ? UF_NAMES[s.uf] ?? s.uf : null].filter(Boolean).join(" · ")}
                      {(s.city || s.uf) && " · "}
                      {s.sections.length > 0 ? `Editorias: ${s.sections.join(", ")}` : "Feed geral"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
