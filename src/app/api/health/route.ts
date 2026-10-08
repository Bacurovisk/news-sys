import { prisma } from "@/lib/db";

// Healthcheck do container (docker compose) e do monitoramento: confirma acesso ao banco.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "db_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
