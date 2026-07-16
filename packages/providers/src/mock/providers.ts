// Mock providers backing DATA_MODE=demo. Deterministic: the dataset is
// generated from a fixed seed anchored to the current day, and manual demo
// syncs produce small minute-seeded increments (so a sync clicked twice in
// the same minute is idempotent).

import type {
  CallProvider,
  CallScorer,
  CrmProvider,
  GeneratedSummary,
  ScoredCall,
  SummaryGenerator,
  SummaryStats,
  TranscriptionProvider,
  ListCallsQuery,
  ListLeadsQuery,
  NormalizedCall,
  NormalizedLead,
  NormalizedQuote,
  NormalizedProducer,
  ProviderStatus,
} from "../types";
import {
  buildDemoSummary,
  generateDemoDataset,
  DEMO_MODEL,
  DEMO_PROMPT_VERSION,
  type DemoDataset,
  type DemoPolicy,
  type DemoScoredCall,
} from "./dataset";
import { mulberry32, randInt } from "./prng";
import { CONTACTS, PRODUCERS } from "./fixtures";
import { generateTranscript, generateSummary, SCRIPTED_TRANSCRIPTS } from "./transcripts";

const DAY_MS = 86_400_000;

/** Anchor = the next UTC midnight, so "day 0" is today and the dataset is stable all day. */
export function demoAnchor(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(d.getTime() + DAY_MS);
}

let cached: { anchorMs: number; dataset: DemoDataset } | null = null;

export function getDemoDataset(now = new Date()): DemoDataset {
  const anchor = demoAnchor(now);
  if (!cached || cached.anchorMs !== anchor.getTime()) {
    cached = { anchorMs: anchor.getTime(), dataset: generateDemoDataset(anchor) };
  }
  return cached.dataset;
}

/** Small "new activity" increment for manual demo syncs, seeded per minute. */
function incrementRng(now: Date) {
  return mulberry32(Math.floor(now.getTime() / 60_000));
}

export class MockCallProvider implements CallProvider {
  async listCalls(q: ListCallsQuery): Promise<{ calls: NormalizedCall[]; nextCursor?: string }> {
    const now = new Date();
    const dataset = getDemoDataset(now);
    const to = q.to ?? now;
    const calls = dataset.calls.filter((c) => c.startTime >= q.from && c.startTime <= to);

    // Fresh sample calls "since the last sync" — mirrors the mockup's demo sync.
    const rng = incrementRng(now);
    const minuteKey = Math.floor(now.getTime() / 60_000);
    const freshCount = randInt(rng, 3, 9);
    for (let i = 0; i < freshCount; i++) {
      const producer = PRODUCERS[Math.floor(rng() * PRODUCERS.length)];
      if (!producer) continue;
      const direction = rng() < 0.55 ? "Outbound" : "Inbound";
      const contacts = CONTACTS.slice(0, -8);
      const contact = contacts[Math.floor(rng() ** 2 * contacts.length)] ?? contacts[0]!;
      const startTime = new Date(now.getTime() - randInt(rng, 1, 10) * 60_000);
      if (startTime < q.from) continue;
      calls.push({
        rcSessionId: `demo-rc-live-${minuteKey}-${i}`,
        rcExtensionId: producer.rcExtensionId,
        direction,
        startTime,
        durationSeconds: randInt(rng, 45, 720),
        result: "Call connected",
        fromNumber: direction === "Outbound" ? "+15550100" : contact.phone,
        toNumber: direction === "Outbound" ? contact.phone : "+15550100",
        contactName: contact.name,
        counterpartyNumber: contact.phone,
        hasRecording: false,
        recordingContentUri: null,
        raw: { demo: true, live: true },
      });
    }
    return { calls };
  }

  /**
   * Demo recordings have no audio. The returned bytes encode the contentUri
   * itself so MockTranscriptionProvider can resolve the pre-written
   * transcript for the session.
   */
  async getRecordingAudio(contentUri: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    return { bytes: new TextEncoder().encode(contentUri), contentType: "text/x-demo-recording" };
  }

  async checkConnection(): Promise<ProviderStatus> {
    return { connected: true, mode: "demo", detail: "Demo connection - sample sync" };
  }
}

export class MockCrmProvider implements CrmProvider {
  async listProducers(): Promise<NormalizedProducer[]> {
    return PRODUCERS.map((p) => {
      const [firstName, ...rest] = p.displayName.split(" ");
      return {
        azProducerId: p.azProducerId,
        firstName: firstName ?? p.displayName,
        lastName: rest.join(" "),
        email: `${p.key}@demo.anchorline.example`,
        isProducer: true,
        isActive: true,
        raw: { demo: true },
      };
    });
  }

  async listLeads(q: ListLeadsQuery): Promise<{ leads: NormalizedLead[]; nextCursor?: string }> {
    const dataset = getDemoDataset();
    let leads = dataset.leads;
    if (q.activitySince) {
      leads = leads.filter((l) => l.lastActivityDate && l.lastActivityDate >= q.activitySince!);
    }
    if (q.createdFrom) {
      leads = leads.filter((l) => l.createDate && l.createDate >= q.createdFrom!);
    }
    return { leads };
  }

  async listLeadQuotes(azLeadId: string): Promise<NormalizedQuote[]> {
    const dataset = getDemoDataset();
    return dataset.quotes.filter((qt) => qt.azLeadId === azLeadId);
  }

  async checkConnection(): Promise<ProviderStatus> {
    return { connected: true, mode: "demo", detail: "Demo connection - sample sync" };
  }

  // ---- Demo-only extensions (not part of CrmProvider) ---------------------
  // Live mode derives sold policies from leads+quotes during sync; demo mode
  // reads them straight from the dataset.
  getDemoPolicies(from?: Date, to?: Date): DemoPolicy[] {
    const dataset = getDemoDataset();
    return dataset.policies.filter(
      (p) => (!from || p.soldDate >= from) && (!to || p.soldDate <= to),
    );
  }

  getDemoScoredCalls(): DemoScoredCall[] {
    return getDemoDataset().scoredCalls;
  }
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  /**
   * Resolves the pre-written transcript for a demo recording. The "audio"
   * bytes are the demo contentUri (see MockCallProvider.getRecordingAudio).
   */
  async transcribe(audio: { bytes: Uint8Array; contentType: string }): Promise<{ text: string }> {
    const uri = new TextDecoder().decode(audio.bytes);
    const sessionId = uri.replace("demo://recording/", "");
    const scored = getDemoDataset().scoredCalls.find((s) => s.rcSessionId === sessionId);
    if (scored) return { text: scored.transcript };
    const scriptedId = sessionId.replace("demo-rc-", "");
    const scripted = SCRIPTED_TRANSCRIPTS[scriptedId];
    if (scripted) return { text: scripted };
    // Unknown demo recording: synthesize something plausible.
    const rng = mulberry32(hashCode(sessionId));
    const steps = {
      rapport: rng() < 0.6,
      discovery: rng() < 0.6,
      quote: true,
      objection: rng() < 0.5,
      close: rng() < 0.5,
    };
    return { text: generateTranscript(rng, "Agent", steps) };
  }
}

/** Deterministic fixture scores for demo mode (no OpenAI key required). */
export class MockScorer {
  score(rcSessionId: string): { score: number; steps: DemoScoredCall["steps"]; summary: string } | null {
    const scored = getDemoDataset().scoredCalls.find((s) => s.rcSessionId === rcSessionId);
    if (scored) return { score: scored.score, steps: scored.steps, summary: scored.summary };
    const rng = mulberry32(hashCode(rcSessionId));
    const score = randInt(rng, 25, 95);
    const steps = {
      rapport: rng() < score / 100 + 0.15,
      discovery: rng() < (score >= 55 ? 0.9 : 0.2),
      quote: rng() < 0.95,
      objection: rng() < (score >= 70 ? 0.85 : 0.15),
      close: rng() < (score >= 65 ? 0.85 : 0.3),
    };
    return { score, steps, summary: generateSummary(rng, steps) };
  }
}

/**
 * CallScorer adapter over MockScorer for the demo scoring pipeline: fixture
 * scorecards resolved by rcSessionId, no OpenAI key required. The scripted
 * calls reproduce the exact seeded scores, so a demo pipeline re-run is a
 * byte-identical no-op.
 */
export class MockCallScorer implements CallScorer {
  private readonly scorer = new MockScorer();

  async scoreCall(input: { transcript: string; rcSessionId: string }): Promise<ScoredCall> {
    const scored = this.scorer.score(input.rcSessionId);
    if (!scored) throw new Error(`MockCallScorer: no fixture score for ${input.rcSessionId}`);
    return {
      result: {
        score: scored.score,
        rapport: scored.steps.rapport,
        discovery_questions: scored.steps.discovery,
        quote_presented: scored.steps.quote,
        objection_handling: scored.steps.objection,
        close_attempted: scored.steps.close,
        summary: scored.summary,
      },
      model: DEMO_MODEL,
      promptVersion: DEMO_PROMPT_VERSION,
    };
  }
}

/**
 * Demo daily-summary generator: builds the three deterministic variants from
 * real DB aggregates and rotates to the one after whichever is currently
 * stored (mirrors the mockup's Regenerate button). No OpenAI key required.
 */
export class MockSummaryGenerator implements SummaryGenerator {
  async generateSummary(
    stats: SummaryStats,
    opts?: { previousSummaryText?: string | null },
  ): Promise<GeneratedSummary> {
    const variants = [0, 1, 2].map((v) => buildDemoSummary(stats, v));
    const currentIdx = variants.findIndex((v) => v.summaryText === opts?.previousSummaryText);
    const next = variants[(currentIdx + 1) % variants.length]!;
    return { summaryText: next.summaryText, insights: next.insights, model: DEMO_MODEL };
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
