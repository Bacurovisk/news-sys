import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label="neojr news — página inicial">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <rect width="64" height="64" rx="14" className="fill-blue-700 dark:fill-blue-500" />
        <path d="M18 46V18h6l16 18V18h6v28h-6L24 28v18z" fill="#fff" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        neojr<span className="font-normal text-blue-700 dark:text-blue-400"> news</span>
      </span>
    </Link>
  );
}
