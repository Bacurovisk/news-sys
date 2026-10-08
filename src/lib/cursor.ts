// Cursor opaco da paginação ("Carregar mais").
// Listagem: keyset (publishedAt, id). Busca: offset, porque a ordem é por relevância + recência.
export type Cursor = { kind: "keyset"; publishedAt: Date; id: number } | { kind: "offset"; offset: number };

export const MAX_SEARCH_OFFSET = 200;

export function encodeCursor(c: Cursor): string {
  const payload = c.kind === "keyset" ? { t: c.publishedAt.toISOString(), i: c.id } : { o: c.offset };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof v.o === "number" && Number.isInteger(v.o) && v.o > 0 && v.o <= MAX_SEARCH_OFFSET) {
      return { kind: "offset", offset: v.o };
    }
    if (typeof v.t === "string" && typeof v.i === "number" && Number.isInteger(v.i) && v.i > 0) {
      const d = new Date(v.t);
      if (!Number.isNaN(d.getTime())) return { kind: "keyset", publishedAt: d, id: v.i };
    }
  } catch {
    // cursor inválido: volta para a primeira página
  }
  return null;
}
