"use client";

import { useState } from "react";

/** Copia o texto; se a área de transferência falhar, o textarea ao lado continua selecionável. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-10 items-center rounded-full bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
    >
      {state === "copied" ? "Copiado!" : state === "failed" ? "Selecione e copie o código abaixo" : label}
    </button>
  );
}
