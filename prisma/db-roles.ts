// Roles de menor privilégio para o site (news_app) e o worker (news_worker).
// Roda no seed, a cada deploy, conectado como o dono das tabelas (POSTGRES_USER):
// cria as roles se faltarem, atualiza a senha e reaplica os GRANT do zero.
//
// news_app:    SELECT em todas as tabelas (menos _prisma_migrations).
// news_worker: SELECT em todas as tabelas, mais as escritas que a coleta e a retenção fazem.
// Tabela nova criada por migration: o ALTER DEFAULT PRIVILEGES já dá SELECT às duas;
// escrita do worker em tabela nova precisa entrar em WORKER_WRITES.
import type { PrismaClient } from "../src/generated/prisma/client.ts";

export const APP_ROLE = "news_app";
export const WORKER_ROLE = "news_worker";

const WORKER_WRITES = [
  `GRANT INSERT, UPDATE, DELETE ON "Article" TO ${WORKER_ROLE}`,
  `GRANT UPDATE ON "Source" TO ${WORKER_ROLE}`,
  `GRANT INSERT, UPDATE ON "JobRun" TO ${WORKER_ROLE}`,
  `GRANT USAGE ON SEQUENCE "Article_id_seq" TO ${WORKER_ROLE}`,
];

// Mesma regra da senha do Postgres: vai na URL de conexão, então só letras e números.
const PASSWORD = /^[A-Za-z0-9]{16,}$/;

function readPassword(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!PASSWORD.test(value)) throw new Error(`${name} inválida: use 16 ou mais letras e números (openssl rand -hex 24)`);
  return value;
}

export async function setupDbRoles(prisma: PrismaClient): Promise<"done" | "skipped"> {
  const appPassword = readPassword("NEWS_APP_DB_PASSWORD");
  const workerPassword = readPassword("NEWS_WORKER_DB_PASSWORD");
  if (!appPassword && !workerPassword && process.env.NODE_ENV !== "production") return "skipped";
  if (!appPassword || !workerPassword) {
    throw new Error("Defina NEWS_APP_DB_PASSWORD e NEWS_WORKER_DB_PASSWORD");
  }

  const both = `${APP_ROLE}, ${WORKER_ROLE}`;
  await prisma.$transaction([
    // CREATE/ALTER ROLE não aceitam parâmetro: a senha entra como variável da transação
    // (bind, some no fim da transação) e o bloco DO monta o comando com format('%L').
    // Ela nunca vai no texto do SQL.
    prisma.$executeRaw`SELECT set_config('news.app_password', ${appPassword}, true)`,
    prisma.$executeRaw`SELECT set_config('news.worker_password', ${workerPassword}, true)`,
    prisma.$executeRawUnsafe(`
      DO $do$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT * FROM (VALUES
            ('${APP_ROLE}', current_setting('news.app_password')),
            ('${WORKER_ROLE}', current_setting('news.worker_password'))
          ) AS v(name, password)
        LOOP
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name) THEN
            EXECUTE format('CREATE ROLE %I', r.name);
          END IF;
          EXECUTE format(
            'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L',
            r.name, r.password);
        END LOOP;
        -- Banco: só CONNECT, e sem TEMP para PUBLIC (o dono continua com tudo).
        EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${both}', current_database());
      END
      $do$`),

    // Schema: usar sim, criar objetos não (já é o padrão no Postgres 15+; fica explícito).
    prisma.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC, ${both}`),
    prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${both}`),

    // Reaplica do zero: o que saiu desta lista deixa de valer no próximo deploy.
    prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${both}`),
    prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${both}`),
    prisma.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${both}`),
    prisma.$executeRawUnsafe(`REVOKE ALL ON "_prisma_migrations" FROM ${both}`),
    ...WORKER_WRITES.map((sql) => prisma.$executeRawUnsafe(sql)),
    // Usadas pela coluna gerada de busca e pela consulta de busca. PUBLIC já tem EXECUTE
    // em funções por padrão; o GRANT explícito evita depender disso.
    prisma.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION public.f_unaccent(text), public.news_tsquery(text) TO ${both}`,
    ),
    // Tabelas criadas depois (por migrations, como este usuário) nascem legíveis para as duas.
    prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${both}`),
  ]);
  return "done";
}
