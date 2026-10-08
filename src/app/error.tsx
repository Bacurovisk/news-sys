"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-lg font-semibold">Algo deu errado ao carregar as notícias</p>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Pode ser uma instabilidade momentânea. Tente de novo em alguns segundos.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded-full bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-neutral-950"
        >
          Tentar de novo
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-full border border-neutral-300 px-5 text-sm dark:border-neutral-700">
          Página inicial
        </Link>
      </div>
    </main>
  );
}
