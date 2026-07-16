# PHASE 6 — Swap Anthropic → OpenAI for call scoring + daily summaries

Task: replace the Anthropic API integration in `packages/providers` with an OpenAI
Chat Completions integration, 1:1 in structure. No behavior changes elsewhere.
The monorepo uses pnpm workspaces; tests are vitest. Do NOT touch `.env` and do
NOT commit anything.

## Step 1 — New file `packages/providers/src/live/openai.ts`

Port of `packages/providers/src/live/anthropic.ts` (read it first; keep the same
thin-fetch style, comment density, and export shape):

- `export const DEFAULT_OPENAI_MODEL = "gpt-5.1";`
- `export interface OpenAIConfig { apiKey: string; model: string; baseUrl: string; }`
- `export function openAIConfigFromEnv(): OpenAIConfig | null` — reads
  `OPENAI_API_KEY` (return `null` if unset/empty), `OPENAI_MODEL` (default
  `DEFAULT_OPENAI_MODEL`), `OPENAI_BASE_URL` (default `https://api.openai.com`,
  strip trailing slashes like the anthropic version does).
- `export class OpenAIApiError extends Error` with a `status: number` field and
  `name = "OpenAIApiError"` (mirror `AnthropicApiError`).
- `export interface OpenAIMessage { role: "user" | "assistant"; content: string; }`
- `export async function completeChat(config, fetchImpl, req)` where `req` is
  `{ system: string; messages: OpenAIMessage[]; maxTokens: number }`, returning
  `{ text: string; raw: unknown }`:
  - `POST ${baseUrl}/v1/chat/completions`
  - Headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`.
  - Body: `{ model, max_completion_tokens: req.maxTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: req.system }, ...req.messages] }`.
  - Send `max_completion_tokens`, NOT `max_tokens` (gpt-5.x rejects `max_tokens`).
  - Do NOT send a `temperature` field at all — gpt-5.x models reject non-default
    temperature. Add a brief code comment noting this replaces the old
    `temperature: 0` determinism nudge.
  - `response_format: { type: "json_object" }` is valid because both callers'
    system prompts contain the word "JSON" (an OpenAI requirement for this mode).
  - On `!res.ok`: read the body text defensively (same guarded pattern as
    anthropic.ts), throw `OpenAIApiError(status, ...)` with a 300-char body slice.
  - Parse response as `{ choices?: [{ message?: { content?: string | null } }], model?: string }`;
    `text = choices[0]?.message?.content ?? ""` (null content, e.g. a refusal,
    falls through to the callers' invalid-JSON correction retry).

## Step 2 — New file `packages/providers/src/live/openai-scorer.ts`

Port of `packages/providers/src/live/anthropic-scorer.ts`. Move over VERBATIM
(same names, same text): `CALL_SCORING_PROMPT_VERSION = "v1"` (unchanged — the
prompt text is identical; the `model` column already records the vendor switch),
`SCORING_SYSTEM_PROMPT`, the zod `scoreSchema`, `parseScoreJson`,
`MAX_TRANSCRIPT_CHARS = 120_000`. Changes:

- Class `OpenAICallScorer implements CallScorer` using `openAIConfigFromEnv()` /
  injected `fetchImpl` exactly like the anthropic version.
- `MAX_OUTPUT_TOKENS` raised 512 → **1024** with a comment: on gpt-5.x,
  `max_completion_tokens` includes hidden reasoning tokens, so 512 could be
  exhausted before any visible output.
- Unconfigured error message: `"OpenAI scoring is not configured — set OPENAI_API_KEY (or run with DATA_MODE=demo)."`
  (mirror the anthropic wording style; the message MUST mention OPENAI_API_KEY).
- Keep the one-correction-retry loop identical: on parse failure, append the
  assistant's bad text and a user correction turn, retry once, then throw.

## Step 3 — New file `packages/providers/src/live/openai-summary.ts`

Port of `packages/providers/src/live/anthropic-summary.ts` the same way:
`SUMMARY_SYSTEM_PROMPT`, `insightSchema`/`summarySchema` (`.length(3)`),
`parseSummaryJson`, previous-summary "fresh angle" nudge, one correction retry —
all verbatim. Class `OpenAISummaryGenerator implements SummaryGenerator`.
`MAX_OUTPUT_TOKENS` 1024 → **2048** (same reasoning-token rationale).
Unconfigured error must mention `OPENAI_API_KEY`.

## Step 4 — Delete the Anthropic files

- `packages/providers/src/live/anthropic.ts`
- `packages/providers/src/live/anthropic-scorer.ts`
- `packages/providers/src/live/anthropic-summary.ts`
- `packages/providers/test/anthropic-scorer.test.ts`
- `packages/providers/test/anthropic-summary.test.ts`

## Step 5 — Factory + re-exports: `packages/providers/src/index.ts`

- Replace the `AnthropicCallScorer` / `AnthropicSummaryGenerator` imports and
  constructions (lines ~15–16 and 46–52) with `OpenAICallScorer` /
  `OpenAISummaryGenerator`.
- Re-export `OpenAIApiError` from `./live/openai` (replacing the
  `AnthropicApiError` re-export) and `CALL_SCORING_PROMPT_VERSION` from
  `./live/openai-scorer`.
- Nothing outside the package imports `AnthropicApiError` (verified), so no
  other import sites change.

## Step 6 — New tests (mirror the deleted ones case-for-case)

`packages/providers/test/openai-scorer.test.ts` and
`packages/providers/test/openai-summary.test.ts`. Read the two deleted test
files FIRST and keep the same structure, describe blocks, and case count (the
suite total must stay 73). Use config
`{ apiKey: "sk-test", model: "gpt-5.1", baseUrl: "https://openai.test" }` and a
fake fetch that records `{ url, body }` and returns the OpenAI response shape
`{ choices: [{ message: { content } }], model: "gpt-5.1" }`. Assertion flips:

- URL is `https://openai.test/v1/chat/completions`.
- `body.model === "gpt-5.1"`; `expect(body).not.toHaveProperty("temperature")`;
  `body.max_completion_tokens` is 1024 (scorer) / 2048 (summary);
  `body.response_format` deep-equals `{ type: "json_object" }`.
- `body.messages[0]` is the system message (`role: "system"`, content contains
  `close_attempted` for the scorer / the insight instructions for the summary);
  `body.messages[1]` is the user turn (scorer: the transcript).
- Correction-retry test: second request's `messages` has length 4
  (`system, user, assistant, user`) with the assistant turn carrying the bad
  text and the final user turn containing the correction instruction.
- API error test: status 429 → throws `OpenAIApiError` with `status === 429`.
- Missing-config test: constructing with `null` config throws an error whose
  message matches `/OPENAI_API_KEY/`.
- Keep the pure `parseScoreJson` / `parseSummaryJson` unit cases unchanged.
- The summary test's Mock-generator cases (`MockSummaryGenerator`,
  `buildDemoSummary`, `DEMO_MODEL`) are provider-agnostic — keep them as-is.

## Step 7 — Comment/doc sweep (no logic changes)

- `packages/providers/src/types.ts`: comments naming Anthropic (~lines 118, 151)
  → OpenAI.
- `packages/providers/src/mock/providers.ts`: "no Anthropic key required"
  comments → OpenAI.
- `apps/worker/src/handlers/score-call.ts`, `apps/worker/src/handlers/daily-summary.ts`,
  `apps/web/src/lib/data/summary.ts`: header comments mentioning Anthropic → OpenAI.
- `.env.example`: line 12 comment (`live = RingCentral + AgencyZoom + Deepgram + OpenAI`);
  replace the ANTHROPIC block (~lines 62–66) with:
  `OPENAI_API_KEY=` (comment: platform.openai.com), `OPENAI_MODEL=gpt-5.1`,
  commented `# OPENAI_BASE_URL=https://api.openai.com` override line — keep the
  surrounding comment style.
- `README.md` (~lines 6, 23, 74, 103): Anthropic → OpenAI, `ANTHROPIC_*` →
  `OPENAI_*`, claude-sonnet-5 → gpt-5.1 where it names the scoring model.
- `GO-LIVE.md`: §1 AI-pipeline credentials table row (`OPENAI_API_KEY` from
  platform.openai.com), the usage-burst warning ("Deepgram + OpenAI usage"),
  §4 env list (`OPENAI_API_KEY`, `OPENAI_MODEL` (default gpt-5.1),
  `OPENAI_BASE_URL` optional).
- `PLAN.md` (~lines 110, 180, 291): update Anthropic/claude mentions and add a
  one-line note in the phase list that Phase 6 switched the AI vendor to OpenAI.

## Step 8 — Verify (run these; all must pass)

```
export PATH="$HOME/Library/pnpm:$PATH"
pnpm -r test        # expect 73 passing (61 providers, 12 metrics)
pnpm -r typecheck
pnpm --filter web build
```
