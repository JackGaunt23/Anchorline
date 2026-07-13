# Anchorline web (Next.js). Build context = repo root:
#   docker build -f apps/web/Dockerfile .
FROM node:22-slim

# Prisma engines need OpenSSL; corepack provides the pinned pnpm.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @anchorline/db generate
# Placeholder envs so `next build` can evaluate config; real values come from
# the runtime environment (Railway service variables). Never baked into layers
# as real secrets.
RUN AUTH_SECRET=build-placeholder \
  DATABASE_URL=postgresql://build:build@localhost:5432/build \
  pnpm --filter @anchorline/web build

ENV NODE_ENV=production
# Railway injects PORT; `next start` picks it up.
CMD ["pnpm", "--filter", "@anchorline/web", "start"]
