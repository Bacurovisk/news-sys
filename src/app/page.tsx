import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Página provisória da fase 2: só confirma a conexão com o banco.
export default async function Home() {
  await connection();
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-semibold">neojr news</h1>
      <ul className="mt-4 flex flex-wrap gap-2 text-sm">
        {categories.map((c) => (
          <li key={c.id} className="rounded-full border px-3 py-1">
            {c.name}
          </li>
        ))}
      </ul>
    </main>
  );
}
