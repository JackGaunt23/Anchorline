# Anchorline — Architecture & Build Plan

Anchorline is a performance dashboard for a P&C insurance agency. It blends call activity
from RingCentral with sales pipeline data from AgencyZoom, layers an AI
transcription/scoring pipeline on top of recorded sales calls, and presents the result to
the agency owner. The static mockup (`anchorline-mockup.html`) is the source of truth for
layout, styling, copy, and metrics.

Fixed decisions (from the brief, not revisited here): Next.js App Router + TypeScript,
Prisma on PostgreSQL, Railway deploy (web service + worker service + Postgres), Tailwind,
Recharts, owner-only Auth.js login, sync-to-database architecture (never live proxying),
provider adapter pattern with `DATA_MODE=demo|live`, single tenant now with
multi-tenant-ready schema (`agency_id` on every domain table).

---

## 1. Architecture

### Monorepo layout (pnpm workspaces)

```
apps/
  web/        Next.js 15 (App Router), TS strict, Tailwind, Recharts, Auth.js v5
  worker/     Node service: node-cron schedules + DB-backed job queue poller
packages/
  db/         Prisma schema, generated client, migrations, seed script
  providers/  CallProvider / CrmProvider / TranscriptionProvider interfaces,
              mock/ (deterministic demo data) and live/ (RingCentral, AgencyZoom,
              Deepgram) implementations, az-client/ (types generated from the
              AgencyZoom OpenAPI spec) — selected by DATA_MODE in one factory
  metrics/    Documented SQL/aggregation module + signal badge logic + unit tests
```

### Principles

- **All dashboard numbers are SQL aggregates over locally synced rows.** RingCentral
  doesn't retain call logs indefinitely and rates Call Log as Heavy usage; AgencyZoom has
  no analytics endpoints. We sync raw entities (keeping `raw` jsonb for backfills) and
  compute everything ourselves.
- **Demo mode is fully self-contained.** `DATA_MODE=demo` requires zero external
  credentials end to end, including the AI pipeline (pre-written mock transcripts and a
  mock scorer). The UI shows the "Demo Mode - Sample Data Only" pill and the synthetic-data
  footer whenever demo mode is active.
- **Money is integer cents. DB times are UTC** (`timestamptz`); rendering uses
  `agencies.timezone` (default `America/New_York`, configurable).
- **The join problem:** nothing links a RingCentral extension to an AgencyZoom producer.
  `producer_identity_map` (managed in Settings) is the only join path for producer-level
  metrics. Calls from unmapped extensions still sync and surface in an "Unmapped" bucket
  in Settings so nothing silently disappears.

---

## 2. Database schema (Prisma)

Every table carries `id`, `agency_id` FK, `created_at`, `updated_at`. Queries are always
scoped by `agency_id`.

| Table | Key fields | Notes |
|---|---|---|
| `agencies` | name, timezone | one row seeded |
| `users` | email (unique), password_hash, name | owner login, seeded from env |
| `producer_identity_map` | display_name, role_title, rc_extension_id?, az_producer_id?, is_ramping, active | unique (agency, rc_extension_id) and (agency, az_producer_id); `is_ramping` is the manual flag behind the Ramping badge |
| `calls` | rc_session_id (unique), rc_extension_id, direction, start_time, duration_seconds, result, from_number, to_number, has_recording, recording_content_uri, raw | index (agency, start_time), (agency, rc_extension_id, start_time) |
| `call_transcripts` | call_id (unique), provider, transcript_text, status pending/processing/done/failed, error | |
| `call_scores` | call_id (unique), score_0_100, rapport, discovery, quote_presented, objection_handling, close_attempted, summary_text, model, prompt_version, raw | rubric bools mirror the five mockup chips |
| `leads` | az_lead_id (unique), az_producer_id, status_code + status, source, create_date, contact_date, quote_date, sold_date, last_activity_date, quoted_premium_cents, sold_premium_cents, raw | field set mirrors the AgencyZoom `Lead` object |
| `quotes` | az_quote_id (unique), lead_id FK, az_producer_id, product_line, carrier, premium_cents, sold, quoted_at, first_seen_at, raw | `quoted_at` derivation in §4; index (agency, quoted_at) |
| `policies_sold` | lead_id FK, az_producer_id, product_line, premium_cents, sold_date, effective_date, policy_number?, raw | unique (agency, lead_id, product_line) for idempotent upsert; index (agency, sold_date) |
| `sync_runs` | source ringcentral/agencyzoom, started_at, finished_at, status, watermark_from, watermark_to, records_upserted, error | feeds the Settings sync log |
| `jobs` | type, payload jsonb, status queued/running/done/failed, run_at, attempts, max_attempts, last_error | index (status, run_at); workers claim with `FOR UPDATE SKIP LOCKED` |
| `daily_summaries` | for_date, summary_text, insights jsonb (exactly three {producer, text, tone}), model, generated_at | tone ∈ good/warning/info |

---

## 3. Provider interfaces (`packages/providers`)

```ts
interface CallProvider {
  listCalls(q: { from: Date; to?: Date; cursor?: string }):
    Promise<{ calls: NormalizedCall[]; nextCursor?: string }>;
  getRecordingAudio(contentUri: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  checkConnection(): Promise<ProviderStatus>;
}

interface CrmProvider {
  listProducers(): Promise<NormalizedProducer[]>;
  listLeads(q: { activitySince?: Date; createdFrom?: Date; cursor?: string }):
    Promise<{ leads: NormalizedLead[]; nextCursor?: string }>;
  listLeadQuotes(azLeadId: string): Promise<NormalizedQuote[]>;
  checkConnection(): Promise<ProviderStatus>;
}

interface TranscriptionProvider {
  transcribe(audio: { bytes: Uint8Array; contentType: string }): Promise<{ text: string }>;
}
```

- `MockCallProvider` / `MockCrmProvider`: deterministic (seeded PRNG) fixture data
  reproducing the mockup's numbers and the five named producers (see §8). Manual demo
  syncs return small randomized increments, mirroring the mockup's toast behavior.
- `RingCentralProvider`: thin typed REST client (built-in `fetch`, no SDK dependency —
  the JWT grant is one POST and 429 handling is custom either way), OAuth 2.0 JWT flow
  (`RC_SERVER_URL`, `RC_CLIENT_ID`, `RC_CLIENT_SECRET`, `RC_USER_JWT`), `GET
  /restapi/v1.0/account/~/call-log?view=Detailed`, Retry-After-aware exponential
  backoff on 429, module-scoped token cache.
- `AgencyZoomProvider`: direct login (`POST /v1/api/auth/login` → JWT bearer,
  re-login on 401), typed via `openapi-typescript` generation from the published spec,
  token-bucket throttle ≤ 25 req/min (documented limit is 30/min daytime, 60/min
  10PM–4AM CT).
- Scoring and daily summaries call the Anthropic API directly (claude-sonnet-4-6 or
  newer) behind small functions with zod-validated structured JSON output and a versioned
  prompt. Demo mode uses a `MockScorer` (fixture scorecards) so no key is needed.

### Verified AgencyZoom endpoint facts (from the OpenAPI spec)

- Rate limit **30 calls/min daytime, 60/min 10PM–4AM CT** — the central sync constraint.
- `POST /v1/api/auth/login` `{username, password}` → `{jwt, ownerAgent}`. Caller
  permissions equal the logged-in user's, so use the agency owner's credentials.
- `GET /v1/api/employees` → id, names, email, `isProducer`, `isActive`, `isOwner`.
- `POST /v1/api/leads/list` — paginated search (pageSize ≤ 100), sortable by
  `lastActivityDate`, filters incl. status (0 NEW / 1 QUOTED / 2 WON / 3 LOST /
  4 CONTACTED / 5 EXPIRED), created-date range, `lastActivityEarliestDate/LatestDate`,
  `assignedTo`. The `Lead` object carries `quoteDate`, `soldDate`, `createDate`,
  `lastActivityDate`, `premium` (total **sold** premium, documented in cents), `quoted`
  (quoted premium in cents), `assignedTo`.
- `GET /v1/api/leads/{leadId}/quotes` → Quote[] (carrier, product line, premium, `sold`,
  `effectiveDate`). **No global quotes endpoint; Quote has no created/quoted timestamp.**
- `GET /v1/api/customers/{customerId}/policies` → per-policy sold detail (policyId,
  soldDate, agentId, policyTypeName, premium in cents, policyNumber) — optional
  enrichment path; sold leads convert to customers.
- Reference reads: `/product-lines`, `/pipelines-and-stages`, `/lead-sources`,
  `/carriers`, `/csrs`.

---

## 4. Sync design

### RingCentral call sync (every 15 min + manual)

1. Watermark = `watermark_to` of the last successful `sync_runs` row (source
   ringcentral), minus a small overlap buffer; completed calls take 15–30 s to appear, so
   the buffer plus idempotent upserts by `rc_session_id` make this safe.
2. Page through Call Log `view=Detailed` from the watermark; upsert `calls`.
3. Enqueue a transcription job for calls with a recording and `duration_seconds ≥
   MIN_TRANSCRIBE_SECONDS` (default 120, configurable).
4. Throttle; exponential backoff on 429; failures recorded in `sync_runs`.

### AgencyZoom CRM sync (every 30 min + manual)

1. Producers (`/employees`) back the connection check; nothing is stored from them —
   the identity map is user-managed and the unmapped-producer bucket derives from
   synced lead rows.
2. Page `POST /leads/list` filtered by `lastActivityEarliestDate` = watermark, sorted
   ascending by `lastActivityDate` so the watermark doubles as a resume pointer; upsert
   `leads` with premium/date fields. Leads whose synced fields are unchanged are skipped
   entirely, so watermark overlap costs no quote requests.
3. **Quote fetch budget:** per-lead `GET /leads/{id}/quotes` only for changed leads that
   ever reached quoting, capped at `AZ_QUOTE_FETCH_BUDGET` per run (default 200) under a
   25 req/min sliding-window throttle. When the budget runs out the run ends successfully
   with the watermark at the last fully processed lead; a large backlog drains across
   multiple runs (or overnight when the limit doubles); this is incremental and safe.
4. Derive `policies_sold`: a lead with `soldDate` + sold premium produces rows (one per
   sold product line where quote detail exists, else a single lead-level row). Upsert is
   idempotent via the (agency, lead, product_line) unique key.
5. `quoted_at` derivation: the API returns no per-quote timestamp, so `quoted_at` =
   lead `quoteDate` when present, else `first_seen_at` (our sync time). Both stored.

### Job queue

`jobs` table polled by the worker (`FOR UPDATE SKIP LOCKED`, `run_at` for scheduling and
backoff). Job types: `sync_ringcentral`, `sync_agencyzoom`, `transcribe_call`,
`score_call`, `generate_daily_summary`. Manual "Sync now" buttons enqueue the same jobs
via API.

### AI pipeline

- **Transcription job:** download recording audio (`contentUri`, same bearer token) →
  Deepgram (`DEEPGRAM_API_KEY`) behind `TranscriptionProvider`. Recordings can lag the
  call log entry: a 404 re-schedules the job with backoff rather than failing it.
- **Scoring job:** transcript → Anthropic rubric prompt (versioned) → strict JSON
  `{score 0-100, rapport, discovery_questions, quote_presented, objection_handling,
  close_attempted, summary}` validated with zod; one retry on invalid JSON, then failed.
  The summary must be one specific, plain-language sentence about what happened.
- **Daily summary job (7:00 AM agency-local):** last-30-day aggregates + per-producer
  scores → paragraph + exactly three insight cards ({producer, text, tone}). The
  dashboard Regenerate button triggers the same generation on demand via an API route.

---

## 5. API routes (`apps/web`, all behind auth except /login)

| Route | Purpose |
|---|---|
| `GET /api/metrics/overview?from&to` | six KPI tiles: value, delta vs prior equal-length period, sparkline buckets |
| `GET /api/metrics/trend?from&to` | daily calls & quotes (trend chart) |
| `GET /api/metrics/premium-monthly?months=6` | monthly premium bars |
| `GET /api/producers?from&to` | producer table rows (badge, calls, talk time, process score, quotes, policies, premium, close rate); feeds bubble chart + leaderboard too |
| `GET /api/producers/[id]/scored-calls?page` | modal: paginated scored calls, most recent first |
| `GET /api/summary` / `POST /api/summary/regenerate` | AI daily summary read / regenerate |
| `GET /api/settings/integrations` | provider connection status + recent sync_runs |
| `POST /api/sync/[source]` | enqueue manual sync (ringcentral / agencyzoom) |
| `GET/POST/PUT /api/settings/identity-map`, `GET /api/settings/unmapped` | mapping CRUD + unmapped buckets |

The global date range lives in `?from&to` URL params (default last 30 days) and drives
every widget. No client code ever calls a third-party API.

---

## 6. Metrics definitions (`packages/metrics`, documented + unit tested)

For range [from, to] and the prior period of equal length:

- **Total calls** — count of voice calls in range
- **Talk time** — sum(duration_seconds) *(RC `duration` includes ring/hold; see open item 7)*
- **Quotes generated** — count of quotes with `quoted_at` in range
- **Policies sold** — count of `policies_sold` with `sold_date` in range
- **Premium written** — sum(premium_cents) in range
- **Close rate** — policies sold / quotes generated, divide-by-zero guarded
- **Producer process score** — mean of the producer's `call_scores.score_0_100` in range
- **Sparklines** — daily buckets across the range

Signal badges (thresholds in one constants file):

- **Top performer** — highest process score AND close rate above team median
- **Needs coaching** — bottom-quartile process score AND bottom-quartile close rate
- **Process gap** — call volume above team median AND process score below 50
- **Ramping** — `is_ramping` flag AND process score trending up vs prior period
- **On pace** — default

Pure functions (badge assignment, deltas, bucketing, close-rate guard) get unit tests;
SQL aggregates get integration tests; sync upserts get idempotency tests (running a sync
twice must not duplicate rows).

---

## 7. Frontend

Faithful componentized port of the mockup: CSS custom-property tokens (full light + dark
sets) mapped into Tailwind, serif display font stack for the wordmark and headings,
monospace tabular numerals for figures. Components: KPI tile (sparkline variant +
close-rate meter variant), trend chart with crosshair tooltip, premium bar chart,
producer table with signal pills and score bars, process-vs-close bubble chart (bubble
size = premium), leaderboard with medals, AI summary panel with three insight cards and
Regenerate, producer drill-down modal (date, duration, score badge, one-sentence summary,
five rubric chips), sync cards with spinner/toast states, "View as table" accessibility
toggles, demo pill + POC banner + synthetic-data footer (demo mode only), loading
skeletons and empty states ("No scored calls yet").

Recharts renders the three large charts styled to the mockup; sparklines are tiny inline
SVG. Pages: **Overview** (full), **Settings** (integration status + sync log +
identity-map CRUD + unmapped bucket), **Calls / Quotes & Policies / Producers / Reports**
as styled placeholder stubs, plus **Login**.

---

## 8. Demo data (seed script targets)

Five producers (identity-mapped to mock RC extensions and AZ producer ids):

| Producer | Signal | Calls | Talk | Score | Quotes | Policies | Premium |
|---|---|---|---|---|---|---|---|
| Priya Nandakumar (Senior Producer) | Top performer | 336 | 2,570m | 94 | 112 | 26 | $79,400 |
| Devon Whitfield | On pace | 412 | 2,860m | 67 | 121 | 19 | $47,600 |
| Aisha Coleman (ramping) | Ramping | 188 | 1,240m | 61 (prev 49) | 54 | 8 | $22,900 |
| Marcus Ferreira | Process gap | 618 | 3,120m | 41 | 148 | 13 | $21,800 |
| Tomas Berglund | Needs coaching | 201 | 1,080m | 34 | 46 | 4 | $15,900 |
| **Total** | | **1,755** | **10,870m** | | **481** | **70** | **$187,600** |

Prior-period volumes are scaled so the deltas match the mockup (+8.4% calls, +5.1% talk,
+11.2% quotes, +14.6% policies, +17.3% premium, +2.9pt close). Earlier months are filled
so the 6-month premium chart approximates 141.2K / 149.8K / 163.4K / 157.9K / 174.3K /
187.6K. The mockup's 20 scripted scored calls (4 per producer — dates, durations,
summaries, rubric chips, scores) are seeded verbatim with matching pre-written mock
transcripts; additional generated scored calls bring each producer's mean score to
target.

---

## 9. Build phases (stop for review after each)

- **Phase 0** — monorepo scaffold, Prisma schema + migrations, provider interfaces, mock
  providers, seed script hitting the targets above, Auth.js owner login, `.env.example`.
- **Phase 1 (client-demo milestone)** — full Overview against demo data through the real
  API/data layer; Settings page (integration status, identity mapping UI, sync log);
  global date range; drill-down modal; AI panel reading seeded summaries; nav stubs.
- **Phase 2** — RingCentral live provider + call sync worker + watermarking + rate-limit
  handling + sync_runs logging.
- **Phase 3** — AgencyZoom live provider (generated types) + CRM sync + quote budget;
  revisit the close-rate denominator with real data.
- **Phase 4** — transcription + scoring pipeline (demo mode via mock transcripts/scorer;
  live via Deepgram + Anthropic).
- **Phase 5** — daily summary + Regenerate, Railway deploy configs (web, worker,
  Postgres), README with setup/runbook.

---

## 10. Open items (flagged, not assumed)

> **See `GO-LIVE.md`** for the production cutover checklist: credential
> acquisition steps (RingCentral app graduation has lead time — start early),
> the smoke-test runbook, and each open item below mapped to its exact switch
> point in the code.

1. **AgencyZoom quotes carry no timestamp** — dated by lead `quoteDate` / first-seen
   (§4). Confirm this is acceptable once real data is visible.
2. **Quote premium units ambiguous** — `Lead.premium`/`Policy.premium` are documented as
   cents; the `Opportunity.premium` example (`300`) suggests dollars. Verify against live
   data in Phase 3 and normalize in the provider.
3. **No list endpoint for quotes or sold policies** — per-lead fetches under the 30/min
   budget; initial backfill spans several cycles or the 60/min overnight window.
4. **Close-rate denominator** (quotes vs leads) — confirm with the owner once real data
   shapes are known; mockup uses policies/quotes.
5. **Recording availability lags the call log** — transcription tolerates 404 and
   retries with backoff.
6. **Mockup data no API provides:** producer role titles ("Senior Producer") → stored in
   the identity map; process scores/rubrics/summaries → produced by our own AI pipeline;
   Aisha's "previous score" trend → computed from our own call_scores history once two
   periods exist.
7. **Talk time semantics** — RC call `duration` includes ring/hold time. True talk time
   needs leg-level analysis; defaulting to `duration`, flagged for the owner.
