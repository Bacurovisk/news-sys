import Link from "next/link";

type Props = { title: string; children?: React.ReactNode; showReset?: boolean };

export function EmptyState({ title, children, showReset = true }: Props) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <svg viewBox="0 0 24 24" className="mb-4 size-10 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M4 5h12v14H6a2 2 0 0 1-2-2zM16 9h4v8a2 2 0 0 1-2 2h-2M7 9h6M7 13h6M7 16h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">{children}</div>}
      {showReset && (
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-neutral-950 dark:hover:bg-blue-400"
        >
          Ver todas as notícias
        </Link>
      )}
    </div>
  );
}
