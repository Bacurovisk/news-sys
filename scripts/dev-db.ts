// Postgres 16 embutido para desenvolvimento local (sem Docker).
// Uso: npm run db:dev  (fica em primeiro plano; Ctrl+C para parar)
// Lê usuário/senha/porta/banco de DATABASE_URL no .env.
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

try {
  process.loadEnvFile();
} catch {
  // sem .env
}

const url = new URL(process.env.DATABASE_URL ?? "postgresql://news:devpass123@localhost:54329/news");
const dataDir = path.resolve(".devdb");
const dbName = url.pathname.slice(1);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  onLog: () => {},
});

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
await client.end();
if (!rowCount) await pg.createDatabase(dbName);

console.log(`Postgres de dev em ${url.host}/${dbName} (dados em .devdb/). Ctrl+C para parar.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
