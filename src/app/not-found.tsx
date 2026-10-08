import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-5xl font-bold text-neutral-300 dark:text-neutral-700">404</p>
      <p className="mt-4 text-lg font-semibold">Página não encontrada</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-neutral-950"
      >
        Ver as últimas notícias
      </Link>
    </main>
  );
}
