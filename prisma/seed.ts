// Seed idempotente: pode rodar a cada deploy.
// Categorias: upsert por slug. Fontes: upsert por feedUrl, sem tocar no estado de coleta
// (etag, falhas, active) de fontes já existentes; fontes fora da lista são desativadas.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { categories } from "./seed-data/categories.ts";
import { sources } from "./seed-data/sources/index.ts";

try {
  process.loadEnvFile();
} catch {
  // sem .env
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }),
});

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, sortOrder: c.sortOrder },
    });
  }

  const bySlug = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  for (const s of sources) {
    const defaultCategoryId = s.category ? bySlug.get(s.category) : null;
    if (s.category && !defaultCategoryId) throw new Error(`Categoria inexistente: ${s.category}`);
    const data = {
      name: s.name,
      siteUrl: s.siteUrl,
      scope: s.scope,
      uf: s.uf ?? null,
      city: s.city ?? null,
      defaultCategoryId: defaultCategoryId ?? null,
    };
    await prisma.source.upsert({
      where: { feedUrl: s.feedUrl },
      create: { ...data, feedUrl: s.feedUrl },
      update: data,
    });
  }

  // Fontes que saíram do seed são desativadas (não apagadas: os artigos continuam até a retenção).
  const { count: deactivated } = await prisma.source.updateMany({
    where: { feedUrl: { notIn: sources.map((s) => s.feedUrl) }, active: true },
    data: { active: false },
  });

  console.log(
    JSON.stringify({ event: "seed_done", categories: categories.length, sources: sources.length, deactivated }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
