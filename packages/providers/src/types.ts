// Provider adapter contracts. These describe exactly the data operations the
// app needs from each external platform; mock implementations back demo mode
// and live implementations (RingCentral, AgencyZoom, Deepgram) back live mode.

export type DataMode = "demo" | "live";

export interface ProviderStatus {
  connected: boolean;
  mode: DataMode;
  detail: string;
}

// ---------------------------------------------------------------------------
// Calls (RingCentral)
// ---------------------------------------------------------------------------

export interface NormalizedCall {
  /** Provider-unique id (RingCentral sessionId). Upsert key. */
  rcSessionId: string;
  rcExtensionId: string | null;
  direction: "Inbound" | "Outbound";
  startTime: Date;
  durationSeconds: number;
  result: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  /** Customer side: `to` on outbound, `from` on inbound; name comes from RingCentral caller ID when present. */
  contactName: string | null;
  counterpartyNumber: string | null;
  hasRecording: boolean;
  recordingContentUri: string | null;
  raw?: unknown;
}

export interface ListCallsQuery {
  from: Date;
  to?: Date;
  cursor?: string;
}

export interface CallProvider {
  listCalls(q: ListCallsQuery): Promise<{ calls: NormalizedCall[]; nextCursor?: string }>;
  getRecordingAudio(contentUri: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  checkConnection(): Promise<ProviderStatus>;
}

// ---------------------------------------------------------------------------
// CRM (AgencyZoom)
// ---------------------------------------------------------------------------

export interface NormalizedProducer {
  azProducerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isProducer: boolean;
  isActive: boolean;
  raw?: unknown;
}

/** AgencyZoom lead status codes: 0 NEW, 1 QUOTED, 2 WON, 3 LOST, 4 CONTACTED, 5 EXPIRED */
export const AZ_LEAD_STATUS: Record<number, string> = {
  0: "new",
  1: "quoted",
  2: "won",
  3: "lost",
  4: "contacted",
  5: "expired",
};

export interface NormalizedLead {
  azLeadId: string;
  azProducerId: string | null;
  contactName: string | null;
  statusCode: number;
  status: string;
  source: string | null;
  createDate: Date | null;
  contactDate: Date | null;
  quoteDate: Date | null;
  soldDate: Date | null;
  lastActivityDate: Date | null;
  quotedPremiumCents: number | null;
  soldPremiumCents: number | null;
  raw?: unknown;
}

export interface NormalizedQuote {
  azQuoteId: string;
  azLeadId: string;
  productLine: string | null;
  carrier: string | null;
  premiumCents: number | null;
  sold: boolean;
  effectiveDate: Date | null;
  raw?: unknown;
}

export interface ListLeadsQuery {
  /** Leads whose lastActivityDate is on/after this instant (sync watermark). */
  activitySince?: Date;
  createdFrom?: Date;
  cursor?: string;
}

export interface CrmProvider {
  listProducers(): Promise<NormalizedProducer[]>;
  listLeads(q: ListLeadsQuery): Promise<{ leads: NormalizedLead[]; nextCursor?: string }>;
  listLeadQuotes(azLeadId: string): Promise<NormalizedQuote[]>;
  checkConnection(): Promise<ProviderStatus>;
}

// ---------------------------------------------------------------------------
// Transcription (Deepgram in live mode)
// ---------------------------------------------------------------------------

export interface TranscriptionProvider {
  transcribe(audio: { bytes: Uint8Array; contentType: string }): Promise<{ text: string }>;
}

// ---------------------------------------------------------------------------
// Call scoring result (produced by the OpenAI scorer or the mock scorer;
// validated against this exact shape before persisting)
// ---------------------------------------------------------------------------

export interface CallScoreResult {
  score: number; // 0-100
  rapport: boolean;
  discovery_questions: boolean;
  quote_presented: boolean;
  objection_handling: boolean;
  close_attempted: boolean;
  /** One specific, plain-language sentence about what happened on the call. */
  summary: string;
}

export interface ScoredCall {
  result: CallScoreResult;
  /** Model identifier persisted alongside the score (audit trail). */
  model: string;
  /** Version of the rubric prompt that produced the score. */
  promptVersion: string;
  raw?: unknown;
}

export interface CallScorer {
  scoreCall(input: {
    transcript: string;
    /** Lets the mock scorer resolve fixture scorecards; ignored by the live scorer. */
    rcSessionId: string;
  }): Promise<ScoredCall>;
}

// ---------------------------------------------------------------------------
// Daily summary generation (OpenAI in live mode, rotating deterministic
// variants in demo mode). SummaryStats is structurally identical to the shape
// @anchorline/metrics builds from DB aggregates — duplicated deliberately, as
// a metrics import here would create a package cycle (db already depends on
// providers for the seed's mock dataset).
// ---------------------------------------------------------------------------

export interface SummaryProducerStats {
  name: string;
  processScore: number;
  prevProcessScore: number | null;
  closeRatePct: number;
  premiumDollars: number;
  isRamping: boolean;
}

export interface SummaryStats {
  totalCalls: number;
  talkMinutes: number;
  quotes: number;
  policies: number;
  premiumDollars: number;
  closeRatePct: number;
  closeRateDeltaPts: number;
  producers: SummaryProducerStats[];
}

export interface SummaryInsight {
  producer: string;
  text: string;
  tone: "good" | "warning" | "info";
}

export interface GeneratedSummary {
  summaryText: string;
  /** Exactly three insight cards. */
  insights: SummaryInsight[];
  model: string;
}

export interface SummaryGenerator {
  generateSummary(
    stats: SummaryStats,
    opts?: {
      /** Rotates demo variants; nudges the live prompt toward a fresh angle. */
      previousSummaryText?: string | null;
    },
  ): Promise<GeneratedSummary>;
}
