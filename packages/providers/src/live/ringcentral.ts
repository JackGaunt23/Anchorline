// RingCentral live provider — implemented in Phase 2.
// OAuth 2.0 JWT credentials flow via @ringcentral/sdk; Call Log API with
// view=Detailed; exponential backoff on 429.

import type { CallProvider, ListCallsQuery, NormalizedCall, ProviderStatus } from "../types";

export class RingCentralProvider implements CallProvider {
  async listCalls(_q: ListCallsQuery): Promise<{ calls: NormalizedCall[]; nextCursor?: string }> {
    throw new Error("RingCentralProvider is implemented in Phase 2. Run with DATA_MODE=demo.");
  }

  async getRecordingAudio(_contentUri: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    throw new Error("RingCentralProvider is implemented in Phase 2. Run with DATA_MODE=demo.");
  }

  async checkConnection(): Promise<ProviderStatus> {
    const configured = Boolean(
      process.env.RC_SERVER_URL && process.env.RC_CLIENT_ID && process.env.RC_CLIENT_SECRET && process.env.RC_USER_JWT,
    );
    return {
      connected: false,
      mode: "live",
      detail: configured ? "Live sync arrives in Phase 2" : "Missing RC_* credentials",
    };
  }
}
