"use client";

import { useState } from "react";

const PLACEHOLDER = "/placeholder.svg";

// Hotlink da imagem original (sem cópia nem proxy, por isso <img> e não next/image),
// sem enviar Referer; troca pela imagem padrão se faltar ou falhar.
export function ArticleImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = src && !failed ? src : PLACEHOLDER;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      // Erro antes da hidratação não dispara onError: confere no momento em que o elemento é montado.
      ref={(img) => {
        if (img && url !== PLACEHOLDER && img.complete && img.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
      className="aspect-[4/3] w-28 shrink-0 rounded-md bg-neutral-200 object-cover sm:w-44 dark:bg-neutral-800"
    />
  );
}
