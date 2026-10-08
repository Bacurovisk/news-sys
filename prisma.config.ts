import { defineConfig, env } from "prisma/config";

// Prisma 7 não carrega .env sozinho. Em produção as variáveis vêm do docker compose.
try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com o ambiente do processo
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Só em dev, para `prisma migrate diff --from-migrations`.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
