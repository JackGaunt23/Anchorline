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
// Call scoring result (produced by the Anthropic scorer or the mock scorer;
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
