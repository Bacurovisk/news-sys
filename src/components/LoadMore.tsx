"use client";

import { useState } from "react";
import type { ArticleItem, ArticlePage } from "@/lib/articles";
import { ArticleCard } from "./ArticleCard";

type Props = { search: string; initialCursor: string | null };

// O botão é um link para ?cursor=… (funciona sem JavaScript); com JS, busca na API e anexa.
export function LoadMore({ search, initialCursor }: Props) {
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "limited">("idle");

  const params = new URLSearchParams(search);
  if (cursor) params.set("cursor", cursor);

  async function load(e: React.MouseEvent) {
    e.preventDefault();
    if (!cursor || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/articles?${params}`, { headers: { accept: "application/json" } });
      if (res.status === 429) return setStatus("limited");
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as ArticlePage;
      setItems((prev) => [...prev, ...page.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      {items.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {items.map((item) => (
            <li key={item.id}>
              <ArticleCard item={item} />
            </li>
          ))}
        </ul>
      )}
      <div className="py-6 text-center" aria-live="polite">
        {status === "error" && <p className="mb-3 text-sm text-red-700 dark:text-red-400">Não foi possível carregar mais notícias.</p>}
        {status === "limited" && (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">Muitas buscas seguidas. Aguarde um minuto e tente de novo.</p>
        )}
        {cursor ? (
          <a
            href={`/?${params}`}
            onClick={load}
            aria-disabled={status === "loading"}
            className="inline-flex h-10 items-center rounded-full border border-neutral-300 px-5 text-sm font-medium hover:bg-neutral-100 aria-disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {status === "loading" ? "Carregando…" : status === "error" || status === "limited" ? "Tentar de novo" : "Carregar mais"}
          </a>
        ) : (
          items.length > 0 && <p className="text-sm text-neutral-500">Você chegou ao fim da lista.</p>
        )}
      </div>
    </>
  );
}
