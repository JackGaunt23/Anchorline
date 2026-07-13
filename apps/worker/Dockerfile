# Anchorline worker (cron + job queue). Build context = repo root:
#   docker build -f apps/worker/Dockerfile .
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

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@anchorline/worker", "start"]
