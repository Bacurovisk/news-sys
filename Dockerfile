# syntax=docker/dockerfile:1
# Estágios finais:
#   runner   → imagem do site (node server.js) e do worker (node dist/worker.mjs)
#   migrator → serviço news-migrate (prisma migrate deploy + seed), só com o Prisma CLI

ARG NODE_IMAGE=node:22.23.2-bookworm-slim
# Só para `prisma generate` resolver env("DATABASE_URL") no build; o valor real vem do compose.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ARG BUILD_DATABASE_URL
ENV DATABASE_URL=${BUILD_DATABASE_URL}
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ARG BUILD_DATABASE_URL
ENV DATABASE_URL=${BUILD_DATABASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# O client gerado fica fora do node_modules (src/generated): gera de novo a partir do schema copiado.
RUN npx prisma generate \
 && npm run build \
 && npm run build:worker

FROM ${NODE_IMAGE} AS migrator
WORKDIR /app
ENV NODE_ENV=production
# Só o CLI do Prisma (mesma versão do package.json), sem o node_modules de desenvolvimento.
RUN PRISMA_VERSION=7.10.0 \
 && npm init -y >/dev/null \
 && npm install --save-exact --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
 && npm cache clean --force
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY prisma.config.ts ./
COPY --from=builder /app/dist/seed.mjs ./dist/seed.mjs
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.mjs"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin nextjs

# Arquivos ficam com dono root (somente leitura para o usuário da aplicação).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
