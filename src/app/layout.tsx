import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://news.neojr.com"),
  title: { default: "neojr news — notícias do Brasil e do Amazonas", template: "%s · neojr news" },
  description:
    "Manchetes de veículos brasileiros reunidas em um só lugar, com link para a matéria completa no site original.",
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Ler o cabeçalho torna todas as páginas dinâmicas, requisito para o nonce do CSP.
  await headers();

  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-6 text-xs text-neutral-500 sm:flex-row sm:justify-between dark:text-neutral-400">
            <p>
              Mostramos só título, resumo e imagem de cada notícia. O conteúdo completo está no site de cada veículo.
            </p>
            <Link href="/fontes" className="underline hover:text-neutral-800 dark:hover:text-neutral-200">
              Fontes e pedidos de remoção
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
