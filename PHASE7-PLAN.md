# PHASE 7 — Calls page + Households page (from new-anchorline-mockup.html)

Build the two pages the new mockup adds. Read `new-anchorline-mockup.html`
(repo root) first — sections `#page-calls` and `#page-households` — and match
its structure, labels, and badge semantics. Match the app's existing visual
language by reading `apps/web/src/app/(app)/page.tsx` and the components it
uses under `apps/web/src/components/overview/` (panels, tables, badges, modal)
before writing any UI. Everything must work in demo mode (`DATA_MODE=demo`,
zero credentials). pnpm monorepo, vitest. Do NOT touch `.env`, do NOT commit.

Conventions (non-negotiable): money in integer cents; timestamps UTC in the DB,
rendered in the agency timezone; every dashboard number is a SQL aggregate over
locally synced rows; no client-side third-party API calls.

## Step 1 — Prisma schema + migration (`packages/db/prisma/schema.prisma`)

One migration named `add_call_contact_fields_and_call_log`:

1. `Call` gains:
   - `contactName String? @map("contact_name")`
   - `counterpartyNumber String? @map("counterparty_number")`
   - `@@index([agencyId, counterpartyNumber, startTime])`
2. `Lead` gains `contactName String? @map("contact_name")`.
3. New enum + model (follow the schema file's existing conventions/comments):

```prisma
enum CallDisposition {
  quoted
  follow_up_needed
  not_interested
  sale_closed
}

/// Producer-entered call outcome from the Calls page "Log call" form. callId
/// is optional (the header button logs a call with no source row) and severs
/// to null rather than cascading — a logged outcome outlives call-row churn.
model CallLog {
  id           String          @id @default(cuid())
  agencyId     String          @map("agency_id")
  callId       String?         @map("call_id")
  contactLabel String          @map("contact_label")
  disposition  CallDisposition
  notes        String?
  createdBy    String?         @map("created_by")
  createdAt    DateTime        @default(now()) @map("created_at")
  updatedAt    DateTime        @updatedAt @map("updated_at")

  agency Agency @relation(fields: [agencyId], references: [id])
  call   Call?  @relation(fields: [callId], references: [id], onDelete: SetNull)

  @@index([agencyId, createdAt])
  @@map("call_logs")
}
```

Add the back-relations on `Agency` (`callLogs CallLog[]`) and `Call`
(`callLogs CallLog[]`).

After `prisma migrate dev --name add_call_contact_fields_and_call_log --create-only`,
APPEND to the generated migration SQL a backfill for existing rows (works for
both demo and any live DB synced before this migration):

```sql
UPDATE calls SET
  counterparty_number = CASE WHEN direction = 'Outbound' THEN to_number ELSE from_number END,
  contact_name = CASE WHEN direction = 'Outbound' THEN raw->'to'->>'name' ELSE raw->'from'->>'name' END
WHERE counterparty_number IS NULL;

UPDATE leads SET
  contact_name = NULLIF(TRIM(CONCAT_WS(' ', raw->>'firstname', raw->>'lastname')), '')
WHERE contact_name IS NULL;
```

Then apply it (`prisma migrate dev`).

## Step 2 — Provider layer (`packages/providers`)

1. `src/types.ts` — `NormalizedCall` gains `contactName: string | null` and
   `counterpartyNumber: string | null` (comment: counterparty = the customer
   side — `to` on outbound, `from` on inbound; name from RingCentral caller ID
   when present).
2. `src/live/ringcentral.ts` — `RcCallRecord.from`/`to` gain `name?: string`;
   `normalizeCallRecord` derives both new fields by direction.
3. `src/live/agencyzoom.ts` — the AZ lead schema exposes
   `firstname`/`lastname`; `normalizeAzLead` sets a new `contactName` field on
   `NormalizedAzLead` (add it to that type):
   `` `${firstname ?? ""} ${lastname ?? ""}`.trim() || null ``.
4. Extend `test/ringcentral.test.ts` with cases for the direction-based
   derivation (outbound → to.name/to number; inbound → from) and null when the
   payload has no name. Extend the agencyzoom test for contactName if a
   normalize test exists there.

## Step 3 — Mock dataset extension (`packages/providers/src/mock/`)

Read `fixtures.ts`, `dataset.ts`, `providers.ts` first. Current gaps to fix:
calls all use `fromNumber: "+15550100"` and a random never-repeating
`toNumber`, `result` is only `"Call connected"` or `"Missed"`, no names; leads
have no names.

1. **Contact pool** in `fixtures.ts`: ~80 deterministic contacts
   `{ name, phone }` (realistic full names, distinct `+1555xxxxxxx` numbers).
   Calls pick contacts with heavy reuse (skewed/weighted draw) so some numbers
   repeat within 30 days and others don't — the Calls page needs both
   qualifying "new conversation" calls and "Contacted Nd ago" skips.
2. **Direction-correct numbers** everywhere calls are generated (dataset
   generator AND the fresh per-minute calls in `MockCallProvider.listCalls`):
   outbound → from = `"+15550100"` (agency line), to = contact; inbound →
   reversed. Set `contactName` and `counterpartyNumber` on every
   `NormalizedCall`.
3. **Result realism**: of the plain (non-scripted) OUTBOUND calls, roughly 25%
   get `result: "Voicemail"` and 10% `"No Answer"` (deterministic via the
   existing seeded rng), rest stay `"Call connected"` / existing `"Missed"`
   logic. Do NOT disturb the per-producer call-count and talk-time budgets
   (they're built with `distributeInt` and asserted exactly in
   `test/dataset.test.ts`). Adding rng draws reshuffles other derived values —
   acceptable; keep the dataset tests passing (update literal expectations
   ONLY where a test hard-codes a value that legitimately shifted, never the
   invariant assertions).
4. **Scripted story calls for the demo Calls page**: a handful of hand-placed
   calls on the anchor day and the day before — at least 3 qualifying
   (>600s, first contact or >30d gap), 1 long call with a recent prior contact
   (skip: contacted Nd ago), 2 short calls (<600s, skip: under 10 min) —
   mirroring the mockup's mix (Grace Whitfield 14:32 first contact qualifies;
   Ben Locke 6:12 under 10 min; Nora Fitzgerald contacted 5d ago skips).
5. **Lead names**: every generated lead gets `contactName` from a
   deterministic household-style pool ("The Alvarez Family", "Whitmore
   Household", … plus generated "«Surname» Household" names) so demo
   Households is populated.
6. `packages/db/src/seed.ts`: map `contactName`/`counterpartyNumber` on call
   insert and `contactName` on lead insert; add `prisma.callLog.deleteMany` to
   the demo wipe (with the other deleteMany calls). Worker
   `apps/worker/src/handlers/sync-ringcentral.ts` upsert maps the two new call
   fields (create AND update branches); `sync-agencyzoom.ts` maps lead
   `contactName`.

## Step 4 — Pure logic in `packages/metrics/src/calls.ts` (new file)

Export from `packages/metrics/src/index.ts`. All functions pure/unit-testable:

```ts
export const NEW_CONV_MIN_SECONDS = 600;
export const NEW_CONV_LOOKBACK_DAYS = 30;

export type ConversationSkipReason = "under_10_min" | "contacted_recently";
export function qualifyConversation(input: {
  durationSeconds: number;
  callStart: Date;
  lastPriorContactAt: Date | null;
}): { qualifies: boolean; reason: ConversationSkipReason | null; daysSinceContact: number | null };
// Duration check FIRST (a short call reads "Under 10 min" even if also recent
// — mockup precedence). daysSinceContact = floor days between callStart and
// lastPriorContactAt (null when first contact). qualifies when
// durationSeconds > NEW_CONV_MIN_SECONDS && (first contact || daysSinceContact > NEW_CONV_LOOKBACK_DAYS).

export type CallResultClass = "connected" | "voicemail" | "no_answer";
export function classifyCallResult(result: string | null): CallResultClass;
// "Call connected" | "Accepted" → connected; "Voicemail" | "Reply" → voicemail;
// anything else (Missed, No Answer, Busy, Hang Up, Rejected, Call Failed,
// Wrong Number, null, …) → no_answer.
// Comment: mapping is provisional until verified against live data
// (GO-LIVE.md §3 switch point — this function).

export function buildDailyCallReport(
  calls: { direction: string; result: string | null }[],
): {
  inbound: number;
  outboundConnected: number;
  outboundVoicemail: number;
  outboundNoAnswer: number;
  outboundTotal: number;
  total: number;
  connectRatePct: number; // outboundConnected / outboundTotal * 100, 1 decimal, 0 when no outbound
};

export function agencyDayRange(timezone: string, now?: Date): { from: Date; to: Date };
// UTC instants bounding "today" in the given IANA timezone. Use the
// Intl/en-CA local-date technique already used in packages/metrics/src/summary.ts
// (see localDateKey there) to find the agency-local date, then compute the
// UTC start/end of that local day (iterate/offset via Intl — no external deps).
```

Tests (new `packages/metrics/test/calls.test.ts`): boundary cases — exactly
600s (not qualifying) vs 601s; exactly 30 days (not qualifying) vs 31; first
contact; short call that is also recent → "under_10_min"; every result-string
class + unknown string + null; report totals + connect-rate rounding + zero
outbound; agencyDayRange around a timezone-midnight boundary (e.g.
America/New_York at 02:00 UTC) and a UTC-day boundary.

## Step 5 — GO-LIVE.md §3 row

Add a deferred-decision row/entry for the RingCentral `result` mapping:
current default mapping as above, switch point
`classifyCallResult() in packages/metrics/src/calls.ts`, verification =
`SELECT DISTINCT result FROM calls` after first live sync.

## Step 6 — Web data layer

New `apps/web/src/lib/data/calls.ts` (follow the style of the existing files
in that directory — they use `prisma.$queryRaw` with agency scoping):

1. `getNewConversations(agencyId)` — candidate calls from the last 7 days
   (relative to now), newest first, LIMIT 40, with per-call prior contact:

```sql
SELECT c.id, c.contact_name, c.counterparty_number, c.direction, c.start_time,
       c.duration_seconds, c.rc_extension_id, prev.last_prior
FROM calls c
LEFT JOIN LATERAL (
  SELECT MAX(p.start_time) AS last_prior FROM calls p
  WHERE p.agency_id = c.agency_id
    AND p.counterparty_number = c.counterparty_number
    AND p.start_time < c.start_time
) prev ON true
WHERE c.agency_id = $1 AND c.start_time >= $from
  AND c.counterparty_number IS NOT NULL
ORDER BY c.start_time DESC
LIMIT 40
```

   Run rows through `qualifyConversation`; resolve producer display names with
   ONE `producerIdentityMap` query over the distinct `rc_extension_id`s
   (fallback label "Unmapped"); contact display = `contact_name` else a
   formatted phone number (add small `fmtPhone` helper to
   `apps/web/src/lib/format.ts` — (555) 012-3456 style for +1 NANP numbers,
   raw string otherwise).
2. `getDailyCallReport(agencyId, timezone)` — `agencyDayRange(timezone)`, then
   `SELECT direction, result, COUNT(*)::int AS n FROM calls WHERE agency_id = $1
   AND start_time >= $from AND start_time < $to GROUP BY 1, 2`, folded through
   `classifyCallResult` into `buildDailyCallReport` input.

New `apps/web/src/lib/data/households.ts`:

```sql
SELECT l.id, l.contact_name, l.az_lead_id, ps.az_producer_id,
       SUM(ps.premium_cents)::int AS premium_cents, COUNT(*)::int AS policies
FROM policies_sold ps JOIN leads l ON l.id = ps.lead_id
WHERE ps.agency_id = $1 AND ps.sold_date >= $from AND ps.sold_date < $to
GROUP BY 1, 2, 3, 4
ORDER BY premium_cents DESC
LIMIT 200
```

Range comes from the same `?days=N` day-aligned range mechanism the Overview
uses (`alignedLastNDays` — read how `(app)/page.tsx` passes it). Producer via
identity map on `az_producer_id` ("Unmapped" fallback). Household label =
`contact_name` else `"Lead #" + az_lead_id`.

## Step 7 — Calls page UI

Replace the stub `apps/web/src/app/(app)/calls/page.tsx` with a server
component composing (new dir `apps/web/src/components/calls/`):

1. `conversations-panel.tsx` (client component) — mockup `#page-calls` first
   panel: title "New conversations", subtitle with the rule ("Flagged when a
   call runs `> 10 min` with a prospect not contacted in the last `30 days`
   (or first contact)." — render the two values as code chips like the
   mockup), header **Log call** button. Qualifying cards grid, then a
   "Didn't qualify" divider, then muted skip cards. Card: contact name;
   `✓ New conversation` badge (teal) OR skip badge ("Under 10 min" /
   "Contacted {n}d ago"); duration `mm:ss`; last-contact line ("First contact
   — no prior call on file" or "Last contact {n} days ago ({date})"); "{when}
   · {producer}" line (agency-TZ render, "Today/Yesterday h:mm AM" style like
   the mockup); qualifying cards get their own **Log call** button that opens
   the modal pre-filled with the contact.
2. `log-call-modal.tsx` (client) — mockup's post-call modal: title "Log call
   outcome"; Contact field (readonly when opened from a card, editable text
   input when opened from the header button), Disposition select (Quoted /
   Follow-up needed / Not interested / Sale closed → enum values), Notes
   textarea, Cancel/Save. On save POST `/api/call-logs`, success/failure toast
   via the existing toast provider, close on success. Follow
   `apps/web/src/components/overview/producer-modal.tsx` backdrop/dialog
   conventions (focus, escape, backdrop click).
3. `call-report.tsx` (server-renderable) — panel "Daily call report",
   subtitle "Today · …": SVG donut (outbound connect rate, center = "{pct}%\nconnected",
   legend: Connected n / Voicemail-no answer n / "Out of {n} outbound calls");
   "Inbound vs. outbound" horizontal bars; segment table Segment / Count /
   % of total with rows Inbound, Outbound — connected, Outbound — voicemail,
   Outbound — no answer, Total calls. Copy colors/tones from the mockup's CSS
   variables mapped onto the app's existing Tailwind token usage.

New API route `apps/web/src/app/api/call-logs/route.ts` — POST only. Follow
the auth/agency-scoping pattern of `apps/web/src/app/api/summary/regenerate/route.ts`.
zod body: `{ contactLabel: string min 1, disposition: enum, notes?: string,
callId?: string }`; if `callId` present verify the call belongs to the agency
(404/400 otherwise); create with `createdBy` = session user email; return the
created row id. No client-side third-party calls.

## Step 8 — Households page UI + nav

1. `apps/web/src/app/(app)/households/page.tsx` — server component, single
   panel "Household view", subtitle like the mockup but real ("Households with
   policies sold in the selected period · rolls up into each producer's totals
   shown in Producer performance."). Table via new
   `apps/web/src/components/households/household-table.tsx`: columns
   Household | Producer (avatar initials + name, like existing producer
   cells) | Premium written | Policies sold. NO "Life app" column. Responsive
   collapse consistent with existing tables. Empty state text when no rows.
2. Nav: `apps/web/src/components/shell/sidebar.tsx` — insert Households
   between Calls and Quotes & Policies. Add a house icon to
   `apps/web/src/components/icons.tsx` (use the mockup's house SVG path).
3. `apps/web/src/components/shell/topbar.tsx` — add "/households" to the
   TITLES map; the "Last 30 days" RangeSelector currently shows only on
   pathname "/" — also show it on "/households", and fix its range-change
   navigation to preserve the CURRENT pathname (it currently hard-codes `/`).

## Step 9 — Verify (all must pass)

```
export PATH="$HOME/Library/pnpm:$PATH"
pnpm --filter @anchorline/db exec prisma migrate dev   # or the repo's migrate script
pnpm db:seed        # from repo root — must complete; demo totals stay 1,755 calls / $187,600 etc.
pnpm -r test        # old suites + new calls tests all green
pnpm -r typecheck
pnpm --filter web build
```

Manual demo check (document what you see in your final message): with docker
Postgres up and the dev server running, `/calls` shows qualifying + didn't-
qualify cards and a populated daily report; logging a call creates a
`call_logs` row; `/households` lists named households with premium/policy
rollups; Households appears in the sidebar between Calls and Quotes & Policies.
