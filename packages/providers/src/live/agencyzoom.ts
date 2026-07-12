// AgencyZoom live provider — implemented in Phase 3.
// Direct login (POST /v1/api/auth/login → JWT bearer, re-login on 401), typed
// client generated from the published OpenAPI spec, token-bucket throttle
// under the documented 30 req/min limit.

import type {
  CrmProvider,
  ListLeadsQuery,
  NormalizedLead,
  NormalizedProducer,
  NormalizedQuote,
  ProviderStatus,
} from "../types";

export class AgencyZoomProvider implements CrmProvider {
  async listProducers(): Promise<NormalizedProducer[]> {
    throw new Error("AgencyZoomProvider is implemented in Phase 3. Run with DATA_MODE=demo.");
  }

  async listLeads(_q: ListLeadsQuery): Promise<{ leads: NormalizedLead[]; nextCursor?: string }> {
    throw new Error("AgencyZoomProvider is implemented in Phase 3. Run with DATA_MODE=demo.");
  }

  async listLeadQuotes(_azLeadId: string): Promise<NormalizedQuote[]> {
    throw new Error("AgencyZoomProvider is implemented in Phase 3. Run with DATA_MODE=demo.");
  }

  async checkConnection(): Promise<ProviderStatus> {
    const configured = Boolean(process.env.AZ_EMAIL && process.env.AZ_PASSWORD);
    return {
      connected: false,
      mode: "live",
      detail: configured ? "Live sync arrives in Phase 3" : "Missing AZ_* credentials",
    };
  }
}
