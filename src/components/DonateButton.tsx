import Link from "next/link";

export function DonateButton() {
  return (
    <Link
      href="/doar"
      className="inline-flex size-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 text-sm font-medium text-amber-900 hover:bg-amber-100 sm:w-auto sm:px-3 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
    >
      <span aria-hidden="true">☕</span>
      <span className="sr-only sm:not-sr-only">Apoiar</span>
    </Link>
  );
}
