import { describe, expect, it } from "vitest";
import {
  RingCentralProvider,
  normalizeCallRecord,
  type RcCallRecord,
  type RingCentralConfig,
} from "../src/live/ringcentral";

// ---------------------------------------------------------------------------
// Harness: injected fetch + sleep so no test touches the network or a timer
// ---------------------------------------------------------------------------

type Handler = (url: string, init?: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return { impl, calls };
}

function fakeSleep() {
  const sleeps: number[] = [];
  const impl = async (ms: number) => {
    sleeps.push(ms);
  };
  return { impl, sleeps };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Distinct clientId per test: the module-level status cache keys on the config.
function cfg(clientId: string): RingCentralConfig {
  return { serverUrl: "https://rc.test", clientId, clientSecret: "secret", jwt: "jwt-assertion" };
}

const isTokenUrl = (url: string) => url.includes("/restapi/oauth/token");
const bearerOf = (init?: RequestInit) => new Headers(init?.headers).get("Authorization");

/** Standard handler: token endpoint issues tok-1, tok-2, ...; everything else via `data`. */
function standardHandler(data: Handler, expiresIn = 3600): Handler {
  let tokens = 0;
  return (url, init) => {
    if (isTokenUrl(url)) {
      tokens += 1;
      return json({ access_token: `tok-${tokens}`, expires_in: expiresIn });
    }
    return data(url, init);
  };
}

// ---------------------------------------------------------------------------

describe("RingCentral auth", () => {
  it("logs in with the JWT grant once and reuses the cached token", async () => {
    const { impl, calls } = fakeFetch(standardHandler(() => json({ records: [] })));
    const provider = new RingCentralProvider(cfg("auth-reuse"), impl);

    await provider.listCalls({ from: new Date("2026-07-01T00:00:00Z") });
    await provider.listCalls({ from: new Date("2026-07-02T00:00:00Z") });

    const tokenCalls = calls.filter((c) => isTokenUrl(c.url));
    expect(tokenCalls).toHaveLength(1);
    const body = String(tokenCalls[0]!.init?.body);
    expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(body).toContain("assertion=jwt-assertion");
    expect(new Headers(tokenCalls[0]!.init?.headers).get("Authorization")).toMatch(/^Basic /);

    const dataCalls = calls.filter((c) => !isTokenUrl(c.url));
    expect(dataCalls.map((c) => bearerOf(c.init))).toEqual(["Bearer tok-1", "Bearer tok-1"]);
  });

  it("re-logs in when the cached token has expired", async () => {
    // expires_in 60s minus the 60s renewal buffer -> expires immediately.
    const { impl, calls } = fakeFetch(standardHandler(() => json({ records: [] }), 60));
    const provider = new RingCentralProvider(cfg("auth-expiry"), impl);

    await provider.listCalls({ from: new Date("2026-07-01T00:00:00Z") });
    await provider.listCalls({ from: new Date("2026-07-02T00:00:00Z") });

    expect(calls.filter((c) => isTokenUrl(c.url))).toHaveLength(2);
    const dataCalls = calls.filter((c) => !isTokenUrl(c.url));
    expect(bearerOf(dataCalls[1]!.init)).toBe("Bearer tok-2");
  });

  it("re-logs in once on 401 and retries; a second 401 fails the request", async () => {
    let dataHits = 0;
    const { impl, calls } = fakeFetch(
      standardHandler(() => {
        dataHits += 1;
        return dataHits === 1 ? json({ error: "stale token" }, 401) : json({ records: [] });
      }),
    );
    const provider = new RingCentralProvider(cfg("auth-401"), impl);

    const { calls: result } = await provider.listCalls({ from: new Date("2026-07-01T00:00:00Z") });
    expect(result).toEqual([]);
    expect(calls.filter((c) => isTokenUrl(c.url))).toHaveLength(2);

    const always401 = fakeFetch(standardHandler(() => json({ error: "nope" }, 401)));
    const failing = new RingCentralProvider(cfg("auth-401-hard"), always401.impl);
    await expect(failing.listCalls({ from: new Date() })).rejects.toMatchObject({
      name: "RingCentralApiError",
      status: 401,
    });
  });
});

describe("RingCentral rate limiting", () => {
  it("honors Retry-After on 429 and retries", async () => {
    let hits = 0;
    const { impl } = fakeFetch(
      standardHandler(() => {
        hits += 1;
        return hits === 1 ? json({}, 429, { "Retry-After": "7" }) : json({ records: [] });
      }),
    );
    const { impl: sleep, sleeps } = fakeSleep();
    const provider = new RingCentralProvider(cfg("rate-header"), impl, sleep);

    await provider.listCalls({ from: new Date("2026-07-01T00:00:00Z") });
    expect(sleeps).toEqual([7000]);
  });

  it("falls back to exponential delays without Retry-After and gives up after 5 retries", async () => {
    const { impl } = fakeFetch(standardHandler(() => json({}, 429)));
    const { impl: sleep, sleeps } = fakeSleep();
    const provider = new RingCentralProvider(cfg("rate-persist"), impl, sleep);

    await expect(provider.listCalls({ from: new Date() })).rejects.toMatchObject({
      name: "RingCentralApiError",
      status: 429,
    });
    expect(sleeps).toEqual([2000, 4000, 8000, 16000, 32000]);
  });
});

describe("RingCentral call log", () => {
  it("queries view=Detailed voice calls for the window and pages via nextCursor", async () => {
    const record: RcCallRecord = {
      sessionId: "s-1",
      type: "Voice",
      direction: "Inbound",
      startTime: "2026-07-10T14:00:00.000Z",
      duration: 320,
      result: "Accepted",
      from: { phoneNumber: "+15550100" },
      to: { phoneNumber: "+15550101" },
      extension: { id: 401 },
    };
    const { impl, calls } = fakeFetch(
      standardHandler((url) =>
        url.includes("page=1")
          ? json({ records: [record], navigation: { nextPage: { uri: "https://rc.test/next" } } })
          : json({ records: [] }),
      ),
    );
    const provider = new RingCentralProvider(cfg("call-log"), impl);

    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-07-11T00:00:00Z");
    const page1 = await provider.listCalls({ from, to });

    const url = calls.find((c) => c.url.includes("/call-log"))!.url;
    expect(url).toContain("view=Detailed");
    expect(url).toContain("type=Voice");
    expect(url).toContain(`dateFrom=${encodeURIComponent(from.toISOString())}`);
    expect(url).toContain(`dateTo=${encodeURIComponent(to.toISOString())}`);
    expect(page1.nextCursor).toBe("2");
    expect(page1.calls).toHaveLength(1);
    expect(page1.calls[0]).toMatchObject({
      rcSessionId: "s-1",
      rcExtensionId: "401",
      direction: "Inbound",
      durationSeconds: 320,
      hasRecording: false,
    });

    const page2 = await provider.listCalls({ from, to, cursor: page1.nextCursor });
    expect(calls.filter((c) => c.url.includes("page=2"))).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("downloads recording audio and surfaces 404s as typed errors for retry", async () => {
    const { impl } = fakeFetch(
      standardHandler((url) =>
        url.includes("gone")
          ? new Response("not found", { status: 404 })
          : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }),
      ),
    );
    const provider = new RingCentralProvider(cfg("recording"), impl);

    const audio = await provider.getRecordingAudio("https://media.rc.test/recording/1/content");
    expect(audio.contentType).toBe("audio/mpeg");
    expect(Array.from(audio.bytes)).toEqual([1, 2, 3]);

    await expect(provider.getRecordingAudio("https://media.rc.test/recording/gone/content")).rejects.toMatchObject({
      name: "RingCentralApiError",
      status: 404,
    });
  });
});

describe("normalizeCallRecord", () => {
  it("resolves the extension from legs when the record has none (prefers the accepting leg)", () => {
    const record: RcCallRecord = {
      sessionId: "s-legs",
      type: "Voice",
      direction: "Inbound",
      startTime: "2026-07-10T14:00:00.000Z",
      duration: 60,
      legs: [
        { result: "Missed", extension: { id: 100 } },
        { result: "Accepted", extension: { id: 200 } },
      ],
    };
    expect(normalizeCallRecord(record)?.rcExtensionId).toBe("200");

    const noAccepted: RcCallRecord = { ...record, legs: [{ result: "Missed", extension: { id: 100 } }] };
    expect(normalizeCallRecord(noAccepted)?.rcExtensionId).toBe("100");

    const noLegs: RcCallRecord = { ...record, legs: [] };
    expect(normalizeCallRecord(noLegs)?.rcExtensionId).toBeNull();
  });

  it("maps recordings and falls back to extension numbers for phone fields", () => {
    const call = normalizeCallRecord({
      sessionId: "s-rec",
      type: "Voice",
      direction: "Outbound",
      startTime: "2026-07-10T14:00:00.000Z",
      duration: 240,
      from: { extensionNumber: "101" },
      to: { phoneNumber: "+15550199" },
      recording: { id: "r1", contentUri: "https://media.rc.test/recording/r1/content" },
    });
    expect(call).toMatchObject({
      fromNumber: "101",
      toNumber: "+15550199",
      contactName: null,
      counterpartyNumber: "+15550199",
      hasRecording: true,
      recordingContentUri: "https://media.rc.test/recording/r1/content",
    });
  });

  it("derives the customer name and number from the direction-specific side", () => {
    const base: RcCallRecord = {
      sessionId: "s-party",
      type: "Voice",
      startTime: "2026-07-10T14:00:00.000Z",
      from: { phoneNumber: "+15550100", name: "Agency Line" },
      to: { phoneNumber: "+15552000001", name: "Maya Alvarez" },
    };

    expect(normalizeCallRecord({ ...base, direction: "Outbound" })).toMatchObject({
      contactName: "Maya Alvarez",
      counterpartyNumber: "+15552000001",
    });
    expect(
      normalizeCallRecord({
        ...base,
        direction: "Inbound",
        from: { phoneNumber: "+15552000002", name: "Daniel Whitmore" },
        to: { phoneNumber: "+15550100", name: "Agency Line" },
      }),
    ).toMatchObject({
      contactName: "Daniel Whitmore",
      counterpartyNumber: "+15552000002",
    });
  });

  it("uses a null contact name when RingCentral sends no caller-ID name", () => {
    expect(
      normalizeCallRecord({
        sessionId: "s-no-name",
        startTime: "2026-07-10T14:00:00.000Z",
        direction: "Inbound",
        from: { phoneNumber: "+15552000003" },
      })?.contactName,
    ).toBeNull();
  });

  it("skips non-voice records and records missing an id or start time", () => {
    const base: RcCallRecord = {
      sessionId: "s",
      startTime: "2026-07-10T14:00:00.000Z",
      direction: "Inbound",
      duration: 10,
    };
    expect(normalizeCallRecord({ ...base, type: "Fax" })).toBeNull();
    expect(normalizeCallRecord({ ...base, sessionId: undefined, id: undefined })).toBeNull();
    expect(normalizeCallRecord({ ...base, startTime: undefined })).toBeNull();
    expect(normalizeCallRecord(base)?.rcSessionId).toBe("s");
  });
});

describe("checkConnection", () => {
  it("reports missing credentials without touching the network", async () => {
    const provider = new RingCentralProvider(null);
    expect(await provider.checkConnection()).toEqual({
      connected: false,
      mode: "live",
      detail: "Missing RC_* credentials",
    });
  });

  it("pings the account endpoint and caches the status", async () => {
    const { impl, calls } = fakeFetch(standardHandler(() => json({ name: "Coastal P&C", status: "Confirmed" })));
    const provider = new RingCentralProvider(cfg("status-ok"), impl);

    const status = await provider.checkConnection();
    expect(status).toEqual({ connected: true, mode: "live", detail: "Connected — Coastal P&C" });

    const before = calls.length;
    await provider.checkConnection();
    expect(calls.length).toBe(before); // served from the 60s status cache
  });

  it("reports a failed ping as disconnected with the error detail", async () => {
    const { impl } = fakeFetch(standardHandler(() => new Response("boom", { status: 500 })));
    const provider = new RingCentralProvider(cfg("status-fail"), impl);

    const status = await provider.checkConnection();
    expect(status.connected).toBe(false);
    expect(status.mode).toBe("live");
    expect(status.detail).toContain("500");
  });
});
