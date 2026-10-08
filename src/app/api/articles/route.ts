import type { NextRequest } from "next/server";
import { getCategories, getLocations, listArticles, resolveFilters } from "@/lib/articles";
import { parseFilters } from "@/lib/filters";
import { clientIp, rateLimit, SEARCH_LIMIT } from "@/lib/rate-limit";

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });

// Página seguinte da listagem ("Carregar mais").
export async function GET(request: NextRequest) {
  const raw = parseFilters(request.nextUrl.searchParams);
  const ip = clientIp(request.headers);

  const general = rateLimit(`api:${ip}`, 120, 60_000);
  const search = raw.q ? rateLimit(`search:${ip}`, SEARCH_LIMIT.limit, SEARCH_LIMIT.windowMs) : general;
  if (!general.ok || !search.ok) {
    const retry = Math.max(general.retryAfterSec, search.retryAfterSec);
    return json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });
  }

  try {
    const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
    const page = await listArticles(resolveFilters(raw, categories, locations), raw.cursor);
    return json(page);
  } catch (err) {
    console.error(JSON.stringify({ event: "api_articles_error", error: err instanceof Error ? err.message : String(err) }));
    return json({ error: "internal_error" }, { status: 500 });
  }
}
