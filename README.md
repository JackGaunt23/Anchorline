# Anchorline

Performance dashboard for a P&C insurance agency. It syncs call activity from
**RingCentral** and pipeline data from **AgencyZoom** into Postgres, runs an
AI pipeline over recorded sales calls (**Deepgram** transcription →
**Anthropic** rubric scoring → daily owner summary), and presents everything
on an owner-facing dashboard.

- `PLAN.md` — architecture, schema, metric definitions, sync design.
- `GO-LIVE.md` — production cutover checklist: credentials to obtain (start
  RingCentral early — app approval has lead time), smoke-test runbook, and
  every deferred decision mapped to its switch point in the code.

## Architecture

pnpm-workspaces monorepo:

| Package | What it is |
|---|---|
| `apps/web` | Next.js 15 dashboard (App Router, Tailwind, Recharts, Auth.js owner login) |
| `apps/worker` | Node service: cron schedules + DB-backed job queue (`FOR UPDATE SKIP LOCKED`) |
| `packages/db` | Prisma schema, client, migrations, demo seed |
| `packages/providers` | Provider interfaces; `mock/` demo implementations and `live/` clients (RingCentral, AgencyZoom, Deepgram, Anthropic) selected by `DATA_MODE` |
| `packages/metrics` | Metric definitions, badge logic, shared SQL aggregates, daily-summary orchestration |

Principles: every dashboard number is a SQL aggregate over locally synced rows
(no live API proxying, ever, and no client-side third-party calls); money is
integer cents; DB times are UTC rendered in the agency's time zone; the
RingCentral↔AgencyZoom join is the user-managed identity map in Settings.

### Data modes

- **`DATA_MODE=demo`** (default) — fully self-contained: deterministic sample
  data, mock transcripts, fixture scores, rotating demo summaries. Zero
  external credentials. The UI shows the demo pill + synthetic-data footer.
- **`DATA_MODE=live`** — real providers, driven by the env vars in
  `.env.example`. See `GO-LIVE.md` before switching.

## Local development (demo mode)

```bash
cp .env.example .env       # set OWNER_EMAIL / OWNER_PASSWORD / AUTH_SECRET
docker compose up -d       # local Postgres on :5432
pnpm install
pnpm db:migrate            # prisma migrate dev
pnpm db:seed               # deterministic demo data matching the mockup
pnpm dev:web               # http://localhost:3000 — log in with OWNER_* creds
pnpm dev:worker            # job worker (only needed to exercise queue jobs)
```

`pnpm db:seed` is also the reset button: demo syncs and Regenerate
intentionally drift the data; reseeding restores the exact mockup numbers
(1,755 calls / 481 quotes / 70 policies / $187,600 / 14.6% close).

## Tests

```bash
pnpm test        # vitest: provider clients (injected fetch), scorer/summary
                 # JSON validation, demo-dataset invariants, metrics/badges
pnpm typecheck   # tsc across all packages
```

## The worker

One poll loop claims jobs from the `jobs` table; cron enqueues them on
schedule (live mode only — demo mode's manual syncs run inline in the web
app so the deterministic numbers don't drift):

| Job type | Schedule | What it does |
|---|---|---|
| `sync_ringcentral` | */15 min + boot | Call-log sync from the last watermark (first run backfills `RC_SYNC_LOOKBACK_DAYS`); enqueues transcription for recorded calls ≥ `MIN_TRANSCRIBE_SECONDS` |
| `sync_agencyzoom` | */30 min + boot | Leads (asc by lastActivityDate), per-lead quotes under `AZ_QUOTE_FETCH_BUDGET`, derived sold policies |
| `transcribe_call` | on demand | Recording download → Deepgram (mock transcript in demo); a recording 404 re-schedules with backoff (recordings lag the call log) |
| `score_call` | on demand | Transcript → Anthropic rubric score (fixture score in demo), persisted to `call_scores` |
| `generate_daily_summary` | 7:00 AM agency-local | Last-30-day aggregates → owner paragraph + three insight cards (same code path as the dashboard's Regenerate button) |

Enqueue anything manually:

```bash
pnpm --filter @anchorline/worker enqueue sync_ringcentral
pnpm --filter @anchorline/worker enqueue transcribe_call '{"callId":"..."}'
pnpm --filter @anchorline/worker enqueue generate_daily_summary
```

Failed jobs retry with quadratic backoff (1m, 4m) up to 3 attempts; sync
outcomes land in `sync_runs` (visible in Settings → sync log).

## Deploying to Railway

Three services in one Railway project, all from this repo:

1. **Postgres** — add the Railway Postgres database; note its `DATABASE_URL`.
2. **web** — new service from the repo. In service settings set the
   config-as-code path to `apps/web/railway.json` (builds
   `apps/web/Dockerfile` from the repo root; the pre-deploy command runs
   `prisma migrate deploy` before each release). Add a public domain.
3. **worker** — second service from the same repo with config path
   `apps/worker/railway.json`.

Set the variables from `.env.example` on **both** services (Railway's shared
variables work well): `DATABASE_URL` (reference the Postgres service),
`DATA_MODE`, `AUTH_SECRET`, `OWNER_*`, `AGENCY_*`, and — for live mode — the
`RC_*`, `AZ_*`, `DEEPGRAM_*`, `ANTHROPIC_*` groups. `PORT` is injected by
Railway; Auth.js is already configured with `trustHost`.

To seed a **demo** deployment after first deploy:

```bash
railway run --service web pnpm db:seed
```

For a **live** cutover, follow `GO-LIVE.md` (credentials, backfill
expectations, identity mapping, deferred-decision checks). After the first
backfill completes, hit **Regenerate** on the dashboard's AI panel so the
first daily summary reflects the synced data rather than waiting for the
7 AM job.

## Troubleshooting

- **Demo numbers drifted** — `pnpm db:seed` restores the exact mockup state.
- **Jobs stuck / handled by old code** — a worker from a previous session may
  still be polling; `pkill -f "tsx.*src/index.ts"` and restart. Clear
  leftovers with `DELETE FROM jobs WHERE status IN ('queued','running');`.
- **"… is not configured" job failures** — live mode without the matching
  credentials; either fill them or set `DATA_MODE=demo`.
- **AgencyZoom backfill looks slow** — by design: quotes cost one request per
  quoted lead under a 25 req/min throttle, draining across runs. See
  `GO-LIVE.md` §2.
