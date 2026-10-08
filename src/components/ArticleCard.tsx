import type { ArticleItem } from "@/lib/articles";
import { safeHref } from "@/lib/safe-url";
import { fullDate, timeAgo } from "@/lib/time";
import { ArticleImage } from "./ArticleImage";

// Todo o conteúdo vem do feed como texto puro; o React escapa na renderização.
export function ArticleCard({ item }: { item: ArticleItem }) {
  const href = safeHref(item.url);
  if (!href) return null;
  const published = new Date(item.publishedAt);

  return (
    <article className="relative flex gap-3 py-4 sm:gap-4">
      <ArticleImage src={safeHref(item.imageUrl)} />
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-snug font-semibold sm:text-lg">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 hover:text-blue-700 hover:underline focus-visible:underline dark:hover:text-blue-400"
          >
            {item.title}
            <span className="sr-only"> (abre o site {item.sourceName} em nova aba)</span>
          </a>
        </h2>
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-600 sm:line-clamp-3 dark:text-neutral-400">
            {item.summary}
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{item.sourceName}</span>
          {" · "}
          <time dateTime={item.publishedAt} title={fullDate(published)}>
            {timeAgo(published)}
          </time>
          {" · "}
          {item.categoryName}
        </p>
      </div>
    </article>
  );
}
