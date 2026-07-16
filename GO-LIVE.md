# Go-live checklist

Everything needed to switch Anchorline from demo to production, in one place:
credentials to obtain (start the RingCentral one **early** — it has lead time),
the cutover runbook, and every decision that was deliberately deferred until
real data is visible, each with its exact switch point in the code.

Day-to-day operations (local dev, worker jobs, Railway deploy steps,
troubleshooting) live in `README.md`; this file is the one-time cutover
checklist.

---

## 1. Credentials to obtain

### RingCentral — START EARLY (approval lead time)

RingCentral apps are created in sandbox and must **graduate to production**,
which involves RingCentral's review and takes lead time (days, not hours).
Kick this off well before the target go-live date.

1. Go to [developers.ringcentral.com](https://developers.ringcentral.com) and
   sign in with an account on the agency's RingCentral tenant (an admin should
   create the developer account).
2. Create an app with:
   - **App type:** REST API app, **server-only (no UI)** — no redirect URI.
   - **Auth:** **JWT auth flow** (OAuth 2.0 JWT credentials grant).
   - **Permissions:** `Read Call Log` and `Read Call Recordings` (recordings
     are needed by the Phase 4 transcription pipeline).
3. In the developer portal, create a **JWT credential** for the user the sync
   should run as (an admin user, so the company-wide call log is visible), and
   authorize it for the app.
4. Follow the portal's **graduation** process to move the app from sandbox to
   production. Production apps use `https://platform.ringcentral.com`;
   sandbox uses `https://platform.devtest.ringcentral.com`.
5. Collect the four values:

   | Env var | Value |
   |---|---|
   | `RC_SERVER_URL` | `https://platform.ringcentral.com` (prod) |
   | `RC_CLIENT_ID` | app's Client ID |
   | `RC_CLIENT_SECRET` | app's Client Secret |
   | `RC_USER_JWT` | the JWT credential from step 3 |

Note: RingCentral rates the Call Log API as "Heavy" usage and does not retain
call logs indefinitely — another reason not to delay go-live once the agency
expects historical data. The first sync backfills `RC_SYNC_LOOKBACK_DAYS`
(default 90).

### AgencyZoom — no approval process

Just the **agency owner's** AgencyZoom login (API permissions equal the
logged-in user's, so it must be the owner):

| Env var | Value |
|---|---|
| `AZ_EMAIL` | owner's AgencyZoom email |
| `AZ_PASSWORD` | owner's AgencyZoom password |

### AI pipeline (built in Phase 4) — no approval process

| Env var | Value |
|---|---|
| `DEEPGRAM_API_KEY` | from [console.deepgram.com](https://console.deepgram.com) |
| `OPENAI_API_KEY` | from [platform.openai.com](https://platform.openai.com) |

Both are instant self-serve signups. Note the first live RingCentral sync
enqueues transcription for **every recorded call ≥ `MIN_TRANSCRIBE_SECONDS`
in the whole backfill window** (90 days, where RingCentral still has the
recording), so expect a one-time burst of Deepgram + OpenAI usage right
after cutover — at typical volumes (a few hundred recordings) this is a few
dollars, but raise `MIN_TRANSCRIBE_SECONDS` or shorten
`RC_SYNC_LOOKBACK_DAYS` first if that matters.

---

## 2. Cutover runbook (live smoke test)

> **Do not set `DATA_MODE=live` against a database that contains demo fixture
> data.** That would mix fixture rows with real rows. Create a fresh database
> (for example, `anchorline_live`), run migrations against it, then run the seed
> with `DATA_MODE=live`; the live-mode seed creates only the agency and owner
> login.

1. Fill the credentials above in the environment (`.env` locally, Railway
   service variables in production). Never commit them.
2. Set `DATA_MODE=live`.
3. Start the worker. On boot it immediately enqueues one sync per source, then
   keeps them scheduled (RingCentral every 15 min, AgencyZoom every 30 min).
4. Watch progress in **Settings → sync log** (or the `sync_runs` table):
   - **RingCentral:** first run backfills 90 days in one go.
     **Cost staging:** before starting the worker in step 3, set
     `MIN_TRANSCRIBE_SECONDS=600` so the initial Deepgram/OpenAI burst is
     limited to long calls. After validating the pipeline, lower it to `120`,
     delete the RingCentral rows from `sync_runs`
     (`DELETE FROM sync_runs WHERE source = 'ringcentral';`), and enqueue
     `sync_ringcentral` once so the full window is re-scanned. This is safe:
     call upserts are idempotent, and pending `call_transcripts` rows dedupe
     transcription.
   - **AgencyZoom:** first run backfills `AZ_SYNC_LOOKBACK_DAYS` (default 365),
     but quotes cost one API request per quoted lead under a 25 req/min
     throttle, so each run stops after `AZ_QUOTE_FETCH_BUDGET` (default 200)
     quote fetches and the backfill **drains across successive runs** — this
     is by design, not a failure. Expect several hours for a large book.
     (AgencyZoom's limit doubles 10PM–4AM CT if a faster overnight backfill
     is wanted: temporarily raise `AZ_QUOTE_FETCH_BUDGET`.)
5. After the first RingCentral sync, run
   `SELECT DISTINCT result FROM calls;` and check the returned strings against
   `classifyCallResult()` as documented in §3, row 7.
6. Manual sync anytime: the Settings page buttons, or
   `pnpm --filter @anchorline/worker enqueue sync_ringcentral` /
   `enqueue sync_agencyzoom`.
7. Check the connection cards on Settings: both should read "Connected — …".
8. Map producers: Settings → identity map. Unmapped RingCentral extensions and
   AgencyZoom producer IDs seen in synced data surface in the "unmapped"
   buckets; assign them to producers (role titles like "Senior Producer" live
   here too — no API provides them).
9. Once the backfill has drained, hit **Regenerate** on the dashboard's AI
   panel so the first daily summary reflects the synced data (the scheduled
   generation runs at 7:00 AM agency-local thereafter).

---

## 3. Decisions deferred until real data (each with its switch point)

| # | Item | Default in code | Switch point |
|---|---|---|---|
| 1 | **Close-rate denominator** — mockup uses policies ÷ quotes (14.6%). Some agencies think in policies ÷ leads. **Confirm with the owner against real numbers.** | policies ÷ quotes | `closeRatePct()` in `packages/metrics/src/periods.ts` |
| 2 | **Quote premium units** — `Lead.premium` is documented cents; per-quote `Opportunity.premium` has no documented unit (spec example `300` hints dollars). Only affects stored quote detail, not the premium KPI (which uses lead-level sold premium). | treated as cents | `quotePremiumCents()` in `packages/providers/src/live/agencyzoom.ts` |
| 3 | **Quote dating** — AgencyZoom quotes carry no timestamp; we date them by the lead's `quoteDate`, else when our sync first saw them. Confirm the resulting quote trend looks right to the owner. | lead `quoteDate` → `first_seen_at` fallback | `upsertQuote()` in `apps/worker/src/handlers/sync-agencyzoom.ts` |
| 4 | **Talk-time semantics** — RingCentral call `duration` includes ring/hold. True talk time needs leg-level analysis. Confirm `duration` is acceptable. | full `duration` | `normalizeCallRecord()` in `packages/providers/src/live/ringcentral.ts` |
| 5 | **Sold-policy product lines** — derived from sold quotes (premium apportioned by quote weight); leads sold without quote detail get one `unknown`-line row, auto-upgraded when detail syncs. Spot-check a few known sales. | derive from sold quotes | `derivePolicies()` in `apps/worker/src/handlers/sync-agencyzoom.ts` |
| 6 | **Aisha's "previous score" trend** (Ramping badge) — computed from our own `call_scores` history; needs two periods of live scoring before it's meaningful. | n/a (data accrual) | badge logic in `packages/metrics/src/badges.ts` |
| 7 | **RingCentral call-result mapping** — verify the provider's real result strings after the first live sync with `SELECT DISTINCT result FROM calls`. | `Call connected` / `Accepted` → connected; `Voicemail` / `Reply` → voicemail; everything else → no answer | `classifyCallResult()` in `packages/metrics/src/calls.ts` |

Recording availability lagging the call log (item 5 of PLAN §10) is handled in
code: the transcription job treats a recording-download 404 as "not ready yet"
and re-schedules itself with growing delays (up to ~3.5h of patience) before
marking the transcript failed.

---

## 4. Production environment variables (full list)

Core: `DATABASE_URL`, `DATA_MODE=live`, `AUTH_SECRET`, `OWNER_EMAIL`,
`OWNER_PASSWORD`, `OWNER_NAME`, `AGENCY_NAME`, `AGENCY_TIMEZONE`.

RingCentral: `RC_SERVER_URL`, `RC_CLIENT_ID`, `RC_CLIENT_SECRET`,
`RC_USER_JWT`, `RC_SYNC_LOOKBACK_DAYS` (90).

AgencyZoom: `AZ_EMAIL`, `AZ_PASSWORD`, `AZ_SYNC_LOOKBACK_DAYS` (365),
`AZ_QUOTE_FETCH_BUDGET` (200), `AZ_BASE_URL` (only to override the default
`https://api.agencyzoom.com`).

AI: `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL` (default gpt-5.1),
`MIN_TRANSCRIBE_SECONDS` (120), `DEEPGRAM_MODEL` (only to override the default
nova-3), `OPENAI_BASE_URL` (only to override the default
`https://api.openai.com`).

See `.env.example` for descriptions and defaults.
