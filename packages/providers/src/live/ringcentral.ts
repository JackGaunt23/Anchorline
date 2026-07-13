// RingCentral live provider.
//
// A thin typed client over the REST API (no SDK dependency — the JWT grant is
// a single POST and we need our own 429 handling anyway, so a small client
// keeps the surface unit-testable with an injected fetch):
// - OAuth 2.0 JWT credentials flow; the access token is cached at module
//   scope so per-request provider instantiations don't re-authenticate.
// - Call Log API with view=Detailed, page-number pagination.
// - 429s honor Retry-After (exponential fallback); one re-login on 401.
//
// Requires a server-only RingCentral app with the JWT auth flow and
// ReadCallLog (+ ReadCallRecordings for Phase 4) permissions. Env:
// RC_SERVER_URL, RC_CLIENT_ID, RC_CLIENT_SECRET, RC_USER_JWT.

import type { CallProvider, ListCallsQuery, NormalizedCall, ProviderStatus } from "../types";

export interface RingCentralConfig {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  jwt: string;
}

export function ringCentralConfigFromEnv(): RingCentralConfig | null {
  const { RC_SERVER_URL, RC_CLIENT_ID, RC_CLIENT_SECRET, RC_USER_JWT } = process.env;
  if (!RC_SERVER_URL || !RC_CLIENT_ID || !RC_CLIENT_SECRET || !RC_USER_JWT) return null;
  return {
    serverUrl: RC_SERVER_URL.replace(/\/+$/, ""),
    clientId: RC_CLIENT_ID,
    clientSecret: RC_CLIENT_SECRET,
    jwt: RC_USER_JWT,
  };
}

export class RingCentralApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RingCentralApiError";
  }
}

type FetchLike = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;

const MAX_RATE_LIMIT_RETRIES = 5;
/** Renew the access token this long before RingCentral's stated expiry. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export class RingCentralHttp {
  private token: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: RingCentralConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async login(): Promise<string> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.config.serverUrl}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: this.config.jwt,
      }).toString(),
    });
    if (!res.ok) {
      throw new RingCentralApiError(res.status, `RingCentral auth failed (${res.status}): ${await safeBody(res)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS,
    };
    return json.access_token;
  }

  private async accessToken(forceLogin: boolean): Promise<string> {
    if (!forceLogin && this.token && this.token.expiresAt > Date.now()) return this.token.accessToken;
    return this.login();
  }

  /**
   * Authenticated GET. `url` is a path on the configured server or an
   * absolute URL (recording contentUris are absolute).
   */
  async request(url: string, params?: Record<string, string | number>): Promise<Response> {
    const qs = params
      ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString()
      : "";
    const full = (url.startsWith("http") ? url : `${this.config.serverUrl}${url}`) + qs;

    let rateRetries = 0;
    let reloggedIn = false;
    let forceLogin = false;
    for (;;) {
      const token = await this.accessToken(forceLogin);
      forceLogin = false;
      const res = await this.fetchImpl(full, { headers: { Authorization: `Bearer ${token}` } });

      if (res.status === 429) {
        rateRetries += 1;
        if (rateRetries > MAX_RATE_LIMIT_RETRIES) {
          throw new RingCentralApiError(429, `RingCentral rate limit persisted after ${MAX_RATE_LIMIT_RETRIES} retries (${url})`);
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
        throw new RingCentralApiError(res.status, `RingCentral request failed (${res.status} ${url}): ${await safeBody(res)}`);
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
// Call-log record normalization (exported for tests)
// ---------------------------------------------------------------------------

interface RcCallLeg {
  direction?: string;
  result?: string;
  legType?: string;
  extension?: { id?: number | string };
}

export interface RcCallRecord {
  id?: string;
  sessionId?: string;
  type?: string;
  direction?: string;
  startTime?: string;
  duration?: number;
  result?: string;
  from?: { phoneNumber?: string; extensionNumber?: string };
  to?: { phoneNumber?: string; extensionNumber?: string };
  extension?: { id?: number | string };
  recording?: { id?: string; contentUri?: string };
  legs?: RcCallLeg[];
}

/**
 * Company call-log records name an extension directly when the call belongs
 * to one; multi-leg calls (transfers, queues) carry it on the legs instead.
 * Prefer the top-level extension, then the leg that accepted the call, then
 * any leg with an extension.
 */
function resolveExtensionId(record: RcCallRecord): string | null {
  if (record.extension?.id != null) return String(record.extension.id);
  const legs = record.legs ?? [];
  const accepted = legs.find(
    (l) => l.extension?.id != null && (l.result === "Accepted" || l.result === "Call connected"),
  );
  const chosen = accepted ?? legs.find((l) => l.extension?.id != null);
  return chosen?.extension?.id != null ? String(chosen.extension.id) : null;
}

/** Returns null for records we don't ingest (non-voice, or missing identity/time). */
export function normalizeCallRecord(record: RcCallRecord): NormalizedCall | null {
  const rcSessionId = record.sessionId ?? record.id;
  if (!rcSessionId || !record.startTime) return null;
  if (record.type && record.type !== "Voice") return null;
  return {
    rcSessionId: String(rcSessionId),
    rcExtensionId: resolveExtensionId(record),
    direction: record.direction === "Inbound" ? "Inbound" : "Outbound",
    startTime: new Date(record.startTime),
    durationSeconds: record.duration ?? 0,
    result: record.result ?? null,
    fromNumber: record.from?.phoneNumber ?? record.from?.extensionNumber ?? null,
    toNumber: record.to?.phoneNumber ?? record.to?.extensionNumber ?? null,
    hasRecording: Boolean(record.recording?.contentUri),
    recordingContentUri: record.recording?.contentUri ?? null,
    raw: record,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const CALL_LOG_PATH = "/restapi/v1.0/account/~/call-log";
const PER_PAGE = 250;
const STATUS_CACHE_TTL_MS = 60_000;

// Shared across provider instantiations (the factory news one up per use):
// one authenticated client per credential set, and a short-lived connection
// status so Settings/layout renders don't each hit the API.
const httpCache = new Map<string, RingCentralHttp>();
let statusCache: { key: string; at: number; status: ProviderStatus } | null = null;

function configKey(c: RingCentralConfig): string {
  return `${c.serverUrl}|${c.clientId}|${c.clientSecret}|${c.jwt}`;
}

export class RingCentralProvider implements CallProvider {
  private readonly config: RingCentralConfig | null;
  private readonly http: RingCentralHttp | null;

  constructor(config: RingCentralConfig | null = ringCentralConfigFromEnv(), fetchImpl?: FetchLike, sleep?: SleepFn) {
    this.config = config;
    if (!config) {
      this.http = null;
    } else if (fetchImpl || sleep) {
      // Explicit transport (tests): don't share or pollute the module cache.
      this.http = new RingCentralHttp(config, fetchImpl, sleep);
    } else {
      const key = configKey(config);
      let http = httpCache.get(key);
      if (!http) {
        http = new RingCentralHttp(config);
        httpCache.set(key, http);
      }
      this.http = http;
    }
  }

  private requireHttp(): RingCentralHttp {
    if (!this.http) {
      throw new Error(
        "RingCentral is not configured — set RC_SERVER_URL, RC_CLIENT_ID, RC_CLIENT_SECRET and RC_USER_JWT (or run with DATA_MODE=demo).",
      );
    }
    return this.http;
  }

  async listCalls(q: ListCallsQuery): Promise<{ calls: NormalizedCall[]; nextCursor?: string }> {
    const page = q.cursor ? Number(q.cursor) : 1;
    const params: Record<string, string | number> = {
      view: "Detailed",
      type: "Voice",
      dateFrom: q.from.toISOString(),
      perPage: PER_PAGE,
      page,
    };
    if (q.to) params.dateTo = q.to.toISOString();

    const res = await this.requireHttp().request(CALL_LOG_PATH, params);
    const json = (await res.json()) as {
      records?: RcCallRecord[];
      navigation?: { nextPage?: { uri?: string } };
    };
    const calls = (json.records ?? [])
      .map(normalizeCallRecord)
      .filter((c): c is NormalizedCall => c !== null);
    return { calls, nextCursor: json.navigation?.nextPage ? String(page + 1) : undefined };
  }

  async getRecordingAudio(contentUri: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    // Recording media can 404 briefly after the call-log record appears; the
    // transcription job (Phase 4) catches RingCentralApiError(404) and retries.
    const res = await this.requireHttp().request(contentUri);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async checkConnection(): Promise<ProviderStatus> {
    if (!this.config) {
      return { connected: false, mode: "live", detail: "Missing RC_* credentials" };
    }
    const key = configKey(this.config);
    if (statusCache && statusCache.key === key && Date.now() - statusCache.at < STATUS_CACHE_TTL_MS) {
      return statusCache.status;
    }
    let status: ProviderStatus;
    try {
      const res = await this.requireHttp().request("/restapi/v1.0/account/~");
      const json = (await res.json()) as { name?: string; status?: string };
      status = {
        connected: true,
        mode: "live",
        detail: json.name ? `Connected — ${json.name}` : "Connected",
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
