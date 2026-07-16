// AgencyZoom live provider.
//
// A thin client typed against the published OpenAPI spec (az-schema.ts is
// generated — see the az:types package script):
// - Direct login (POST /v1/api/auth/login → JWT bearer); the token is cached
//   at module scope, its expiry read from the JWT's exp claim, and a stale
//   401 triggers one re-login.
// - Sliding-window throttle: AgencyZoom allows 30 requests/min during the
//   day (60/min 10PM–4AM CT); we budget 25/min and count every request,
//   including logins and retries.
// - 429s honor Retry-After (exponential fallback), like the RC client.
//
// Credentials should be the agency owner's (API permissions equal the logged
// in user's). Env: AZ_EMAIL, AZ_PASSWORD (AZ_BASE_URL to override the server).

import type { components } from "./az-schema";
import {
  AZ_LEAD_STATUS,
  type CrmProvider,
  type ListLeadsQuery,
  type NormalizedLead,
  type NormalizedProducer,
  type NormalizedQuote,
  type ProviderStatus,
} from "../types";

type AzEmployee = components["schemas"]["Employee"];
type AzLead = components["schemas"]["Lead"];
type AzQuote = components["schemas"]["Quote"];
type AzLoginResponse = components["schemas"]["LoginResponse"];
type AzLeadSearchResponse = components["schemas"]["LeadSearchResponse"];

export interface AgencyZoomConfig {
  baseUrl: string;
  email: string;
  password: string;
}

const DEFAULT_BASE_URL = "https://api.agencyzoom.com";

export function agencyZoomConfigFromEnv(): AgencyZoomConfig | null {
  const { AZ_EMAIL, AZ_PASSWORD, AZ_BASE_URL } = process.env;
  if (!AZ_EMAIL || !AZ_PASSWORD) return null;
  return {
    baseUrl: (AZ_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    email: AZ_EMAIL,
    password: AZ_PASSWORD,
  };
}

export class AgencyZoomApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgencyZoomApiError";
  }
}

type FetchLike = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;
type NowFn = () => number;

const MAX_RATE_LIMIT_RETRIES = 5;
/** Renew the login token this long before the JWT's stated expiry. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
/** Documented limit is 30/min daytime; stay safely under it. */
export const AZ_REQUESTS_PER_MINUTE = 25;
const RATE_WINDOW_MS = 60_000;

/** Best-effort read of the exp claim (seconds) from a JWT; null if opaque. */
export function jwtExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

export class AgencyZoomHttp {
  private token: { jwt: string; expiresAt: number | null } | null = null;
  /** Timestamps of requests sent in the last rate window (oldest first). */
  private requestTimes: number[] = [];

  constructor(
    private readonly config: AgencyZoomConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly now: NowFn = Date.now,
  ) {}

  /** Blocks until a request slot is free, then claims it. */
  private async takeSlot(): Promise<void> {
    for (;;) {
      const cutoff = this.now() - RATE_WINDOW_MS;
      while (this.requestTimes.length > 0 && this.requestTimes[0]! <= cutoff) {
        this.requestTimes.shift();
      }
      if (this.requestTimes.length < AZ_REQUESTS_PER_MINUTE) break;
      await this.sleep(this.requestTimes[0]! + RATE_WINDOW_MS - this.now());
    }
    this.requestTimes.push(this.now());
  }

  private async login(): Promise<string> {
    await this.takeSlot();
    const res = await this.fetchImpl(`${this.config.baseUrl}/v1/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.config.email, password: this.config.password }),
    });
    if (!res.ok) {
      throw new AgencyZoomApiError(res.status, `AgencyZoom login failed (${res.status}): ${await safeBody(res)}`);
    }
    const json = (await res.json()) as AzLoginResponse;
    if (!json.jwt) throw new AgencyZoomApiError(500, "AgencyZoom login returned no JWT");
    const exp = jwtExpiryMs(json.jwt);
    this.token = { jwt: json.jwt, expiresAt: exp === null ? null : exp - TOKEN_EXPIRY_BUFFER_MS };
    return json.jwt;
  }

  private async accessToken(forceLogin: boolean): Promise<string> {
    if (!forceLogin && this.token && (this.token.expiresAt === null || this.token.expiresAt > this.now())) {
      return this.token.jwt;
    }
    return this.login();
  }

  /** Authenticated request against a /v1/api path. */
  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;

    let rateRetries = 0;
    let reloggedIn = false;
    let forceLogin = false;
    for (;;) {
      const token = await this.accessToken(forceLogin);
      forceLogin = false;
      await this.takeSlot();
      const res = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined && { "Content-Type": "application/json" }),
        },
        ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
      });

      if (res.status === 429) {
        rateRetries += 1;
        if (rateRetries > MAX_RATE_LIMIT_RETRIES) {
          throw new AgencyZoomApiError(429, `AgencyZoom rate limit persisted after ${MAX_RATE_LIMIT_RETRIES} retries (${path})`);
        }
        const retryAfter = Number(res.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** rateRetries * 1000;
        await this.sleep(delayMs);
        continue;
      }
      if (res.status === 401 && !reloggedIn) {
        reloggedIn = true;
        forceLogin = true;
        continue;
      }
      if (!res.ok) {
        throw new AgencyZoomApiError(res.status, `AgencyZoom request failed (${res.status} ${path}): ${await safeBody(res)}`);
      }
      return res;
    }
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<unreadable body>";
  }
}

// ---------------------------------------------------------------------------
// Normalization (exported for tests)
// ---------------------------------------------------------------------------

/**
 * AgencyZoom dates are date-granularity strings ("YYYY-MM-DD" per the spec);
 * parse those as UTC midnight, anything longer via the Date constructor.
 */
export function parseAzDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lead.premium and Lead.quoted are documented as cents. Opportunity.premium
 * has no documented unit (spec example "300") — OPEN ITEM: verify against
 * live data; this is the single switch point if it turns out to be dollars.
 */
function quotePremiumCents(premium: number | undefined): number | null {
  return premium ?? null;
}

export function normalizeAzEmployee(e: AzEmployee): NormalizedProducer | null {
  if (e.id == null) return null;
  return {
    azProducerId: String(e.id),
    firstName: e.firstname ?? "",
    lastName: e.lastname ?? "",
    email: e.email ?? null,
    isProducer: Boolean(e.isProducer),
    isActive: e.isActive !== false,
    raw: e,
  };
}

export function normalizeAzLead(lead: AzLead): NormalizedLead | null {
  if (lead.id == null) return null;
  const statusCode = lead.status ?? 0;
  return {
    azLeadId: String(lead.id),
    azProducerId: lead.assignedTo != null ? String(lead.assignedTo) : null,
    contactName: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim() || null,
    statusCode,
    status: AZ_LEAD_STATUS[statusCode] ?? "unknown",
    source: lead.leadSourceName ?? null,
    createDate: parseAzDate(lead.createDate),
    contactDate: parseAzDate(lead.contactDate),
    quoteDate: parseAzDate(lead.quoteDate),
    soldDate: parseAzDate(lead.soldDate),
    lastActivityDate: parseAzDate(lead.lastActivityDate),
    quotedPremiumCents: lead.quoted ?? null,
    soldPremiumCents: lead.premium ?? null,
    raw: lead,
  };
}

export function normalizeAzQuote(quote: AzQuote, azLeadId: string): NormalizedQuote | null {
  if (quote.id == null) return null;
  return {
    azQuoteId: String(quote.id),
    azLeadId,
    productLine: quote.productName ?? quote.standardProductLineCode ?? null,
    carrier: quote.carrierName ?? null,
    premiumCents: quotePremiumCents(quote.premium),
    sold: Boolean(quote.sold),
    effectiveDate: parseAzDate(quote.effectiveDate),
    raw: quote,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const PER_PAGE = 100; // leads/list maximum
const STATUS_CACHE_TTL_MS = 60_000;

// Shared across provider instantiations (the factory news one up per use):
// one authenticated, throttled client per credential set, and a short-lived
// connection status so Settings/layout renders don't each spend a request.
const httpCache = new Map<string, AgencyZoomHttp>();
let statusCache: { key: string; at: number; status: ProviderStatus } | null = null;

function configKey(c: AgencyZoomConfig): string {
  return `${c.baseUrl}|${c.email}|${c.password}`;
}

/** Formats an instant as the YYYY-MM-DD (UTC) date AgencyZoom filters expect. */
export function toAzDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class AgencyZoomProvider implements CrmProvider {
  private readonly config: AgencyZoomConfig | null;
  private readonly http: AgencyZoomHttp | null;

  constructor(
    config: AgencyZoomConfig | null = agencyZoomConfigFromEnv(),
    fetchImpl?: FetchLike,
    sleep?: SleepFn,
    now?: NowFn,
  ) {
    this.config = config;
    if (!config) {
      this.http = null;
    } else if (fetchImpl || sleep || now) {
      // Explicit transport (tests): don't share or pollute the module cache.
      this.http = new AgencyZoomHttp(config, fetchImpl, sleep, now);
    } else {
      const key = configKey(config);
      let http = httpCache.get(key);
      if (!http) {
        http = new AgencyZoomHttp(config);
        httpCache.set(key, http);
      }
      this.http = http;
    }
  }

  private requireHttp(): AgencyZoomHttp {
    if (!this.http) {
      throw new Error("AgencyZoom is not configured — set AZ_EMAIL and AZ_PASSWORD (or run with DATA_MODE=demo).");
    }
    return this.http;
  }

  async listProducers(): Promise<NormalizedProducer[]> {
    const res = await this.requireHttp().request("/v1/api/employees");
    const json = (await res.json()) as AzEmployee[];
    return (json ?? []).map(normalizeAzEmployee).filter((p): p is NormalizedProducer => p !== null);
  }

  async listLeads(q: ListLeadsQuery): Promise<{ leads: NormalizedLead[]; nextCursor?: string }> {
    const page = q.cursor ? Number(q.cursor) : 0;
    const body: Record<string, unknown> = {
      pageSize: PER_PAGE,
      page,
      // Ascending activity order makes the sync watermark a resume pointer:
      // everything before the last processed lead is already ingested.
      sort: "lastActivityDate",
      order: "asc",
    };
    if (q.activitySince) body.lastActivityEarliestDate = toAzDateString(q.activitySince);
    if (q.createdFrom) body.startDate = toAzDateString(q.createdFrom);

    const res = await this.requireHttp().request("/v1/api/leads/list", { method: "POST", body });
    const json = (await res.json()) as AzLeadSearchResponse;
    const leads = (json.leads ?? []).map(normalizeAzLead).filter((l): l is NormalizedLead => l !== null);
    return { leads, nextCursor: (json.leads?.length ?? 0) === PER_PAGE ? String(page + 1) : undefined };
  }

  async listLeadQuotes(azLeadId: string): Promise<NormalizedQuote[]> {
    const res = await this.requireHttp().request(`/v1/api/leads/${encodeURIComponent(azLeadId)}/quotes`);
    const json = (await res.json()) as AzQuote[];
    return (json ?? []).map((quote) => normalizeAzQuote(quote, azLeadId)).filter((qt): qt is NormalizedQuote => qt !== null);
  }

  async checkConnection(): Promise<ProviderStatus> {
    if (!this.config) {
      return { connected: false, mode: "live", detail: "Missing AZ_* credentials" };
    }
    const key = configKey(this.config);
    if (statusCache && statusCache.key === key && Date.now() - statusCache.at < STATUS_CACHE_TTL_MS) {
      return statusCache.status;
    }
    let status: ProviderStatus;
    try {
      const producers = await this.listProducers();
      const owner = producers.find((p) => (p.raw as AzEmployee | undefined)?.isOwner);
      const name = owner ? `${owner.firstName} ${owner.lastName}`.trim() : null;
      status = {
        connected: true,
        mode: "live",
        detail: name ? `Connected — ${name}` : `Connected — ${producers.length} employees`,
      };
    } catch (err) {
      status = {
        connected: false,
        mode: "live",
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
    statusCache = { key, at: Date.now(), status };
    return status;
  }
}
