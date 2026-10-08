import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client.ts";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  // Sessão sempre em UTC: o adapter pg envia DateTime sem offset, e com outro TimeZone
  // o Postgres gravaria timestamptz deslocado (ex.: +3 h com America/Sao_Paulo).
  const adapter = new PrismaPg({ connectionString, max: 5, options: "-c TimeZone=UTC" });
  return new PrismaClient({ adapter });
}

// Reaproveita o client entre hot reloads do `next dev`.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
