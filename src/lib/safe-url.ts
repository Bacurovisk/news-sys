/** Devolve a URL só se for http(s) absoluta; caso contrário null. Defesa extra na renderização. */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
