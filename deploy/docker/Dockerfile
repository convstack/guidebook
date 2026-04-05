FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 -G app app
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/bun.lock* ./
COPY --from=builder --chown=app:app /app/server.ts ./server.ts
COPY --from=builder --chown=app:app /app/src/db/migrate.ts ./src/db/migrate.ts
RUN bun install --frozen-lockfile --production
USER app
EXPOSE 5000
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run server.ts"]
