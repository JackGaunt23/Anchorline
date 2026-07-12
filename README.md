# Anchorline

Performance dashboard for a P&C insurance agency: RingCentral call activity +
AgencyZoom pipeline data + an AI call-scoring pipeline. See `PLAN.md` for the
full architecture and build phases. (Full setup/runbook lands in Phase 5.)

## Quick start (demo mode, no external credentials)

```bash
cp .env.example .env       # set OWNER_EMAIL / OWNER_PASSWORD / AUTH_SECRET
docker compose up -d       # local Postgres
pnpm install
pnpm db:migrate            # prisma migrate dev
pnpm db:seed               # deterministic demo data matching the mockup
pnpm dev:web               # http://localhost:3000 — log in with OWNER_* creds
pnpm dev:worker            # background job worker (optional in Phase 0/1)
```

## Workspace layout

- `apps/web` — Next.js dashboard (Auth.js owner login)
- `apps/worker` — cron + DB-backed job queue worker
- `packages/db` — Prisma schema/client/migrations/seed
- `packages/providers` — provider interfaces, demo mocks, live adapters
- `packages/metrics` — metric definitions, badge logic (unit tested)

`DATA_MODE=demo` (default) runs fully self-contained on seeded sample data;
`DATA_MODE=live` uses RingCentral/AgencyZoom/Deepgram/Anthropic credentials
(Phases 2-5).

## Tests

```bash
pnpm test        # vitest: demo-dataset invariants + metrics/badge unit tests
pnpm typecheck
```
