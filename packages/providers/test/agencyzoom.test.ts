import { describe, expect, it } from "vitest";
import {
  AZ_REQUESTS_PER_MINUTE,
  AgencyZoomProvider,
  jwtExpiryMs,
  normalizeAzLead,
  normalizeAzQuote,
  parseAzDate,
  toAzDateString,
  type AgencyZoomConfig,
} from "../src/live/agencyzoom";

// ---------------------------------------------------------------------------
// Harness: injected fetch + sleep + clock, so no test touches the network,
// a timer, or real time. The fake sleep advances the fake clock (the
// throttle loops until the rate window actually frees up).
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

function fakeClock(startMs = 1_000_000) {
  let nowMs = startMs;
  const sleeps: number[] = [];
  return {
    now: () => nowMs,
    advance: (ms: number) => {
      nowMs += ms;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    sleeps,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Distinct email per test: the module-level status cache keys on the config.
function cfg(email: string): AgencyZoomConfig {
  return { baseUrl: "https://az.test", email, password: "secret" };
}

function provider(email: string, handler: Handler) {
  const clock = fakeClock();
  const { impl, calls } = fakeFetch(handler);
  return { provider: new AgencyZoomProvider(cfg(email), impl, clock.sleep, clock.now), calls, clock };
}

const isLoginUrl = (url: string) => url.includes("/v1/api/auth/login");
const bearerOf = (init?: RequestInit) => new Headers(init?.headers).get("Authorization");

/** An unsigned JWT whose payload carries the given claims. */
function testJwt(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

/** Standard handler: login endpoint issues jwt-1, jwt-2, ...; everything else via `data`. */
function standardHandler(data: Handler, jwtOf: (n: number) => string = (n) => testJwt({ sub: `jwt-${n}` })): Handler {
  let logins = 0;
  return (url, init) => {
    if (isLoginUrl(url)) {
      logins += 1;
      return json({ jwt: jwtOf(logins), ownerAgent: true });
    }
    return data(url, init);
  };
}

const EMPLOYEES = [
  { id: 11, firstname: "Dana", lastname: "Okafor", email: "dana@agency.test", isProducer: true, isActive: true, isOwner: true },
  { id: 12, firstname: "Lee", lastname: "Fontaine", email: "lee@agency.test", isProducer: true, isActive: false, isOwner: false },
];

// ---------------------------------------------------------------------------

describe("AgencyZoom auth", () => {
  it("logs in once with the owner credentials and reuses the JWT", async () => {
    const { provider: p, calls } = provider("auth-reuse", standardHandler(() => json([])));

    await p.listProducers();
    await p.listProducers();

    const logins = calls.filter((c) => isLoginUrl(c.url));
    expect(logins).toHaveLength(1);
    expect(JSON.parse(String(logins[0]!.init?.body))).toEqual({ username: "auth-reuse", password: "secret" });

    const dataCalls = calls.filter((c) => !isLoginUrl(c.url));
    expect(dataCalls).toHaveLength(2);
    expect(new Set(dataCalls.map((c) => bearerOf(c.init))).size).toBe(1);
  });

  it("re-logs in when the JWT exp claim has passed", async () => {
    const clock = fakeClock();
    // Expires 30s after "now" — inside the 60s renewal buffer, so the second
    // request must log in again.
    const { impl, calls } = fakeFetch(
      standardHandler(
        () => json([]),
        (n) => testJwt({ exp: (clock.now() + 30_000) / 1000, n }),
      ),
    );
    const p = new AgencyZoomProvider(cfg("auth-expiry"), impl, clock.sleep, clock.now);

    await p.listProducers();
    await p.listProducers();

    expect(calls.filter((c) => isLoginUrl(c.url))).toHaveLength(2);
  });

  it("re-logs in once on 401 and retries; a second 401 fails the request", async () => {
    let dataHits = 0;
    const { provider: p, calls } = provider(
      "auth-401",
      standardHandler(() => {
        dataHits += 1;
        return dataHits === 1 ? json({ error: "stale token" }, 401) : json(EMPLOYEES);
      }),
    );

    const producers = await p.listProducers();
    expect(producers).toHaveLength(2);
    expect(calls.filter((c) => isLoginUrl(c.url))).toHaveLength(2);

    const hard = provider("auth-401-hard", standardHandler(() => json({ error: "nope" }, 401)));
    await expect(hard.provider.listProducers()).rejects.toMatchObject({
      name: "AgencyZoomApiError",
      status: 401,
    });
  });

  it("reads the exp claim from a JWT and tolerates opaque tokens", () => {
    expect(jwtExpiryMs(testJwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
    expect(jwtExpiryMs(testJwt({ sub: "no-exp" }))).toBeNull();
    expect(jwtExpiryMs("not-a-jwt")).toBeNull();
  });
});

describe("AgencyZoom rate limiting", () => {
  it("throttles to the request budget per sliding minute (login included)", async () => {
    const { provider: p, clock, calls } = provider("throttle", standardHandler(() => json([])));

    // Login consumes one slot, so this exactly fills the window...
    for (let i = 0; i < AZ_REQUESTS_PER_MINUTE - 1; i++) {
      await p.listProducers();
    }
    expect(clock.sleeps).toHaveLength(0);
    expect(calls).toHaveLength(AZ_REQUESTS_PER_MINUTE);

    // ...and the next request must wait for the oldest slot to expire.
    await p.listProducers();
    expect(clock.sleeps).toHaveLength(1);
    expect(clock.sleeps[0]).toBe(60_000);
  });

  it("does not throttle requests spread beyond the window", async () => {
    const { provider: p, clock } = provider("throttle-spread", standardHandler(() => json([])));
    for (let i = 0; i < AZ_REQUESTS_PER_MINUTE * 2; i++) {
      await p.listProducers();
      clock.advance(5_000); // 12 requests/min — well under budget
    }
    expect(clock.sleeps).toHaveLength(0);
  });

  it("honors Retry-After on 429, then falls back to exponential delays until giving up", async () => {
    let hits = 0;
    const retryAfter = provider(
      "retry-after",
      standardHandler(() => {
        hits += 1;
        return hits === 1 ? json({}, 429, { "Retry-After": "7" }) : json([]);
      }),
    );
    await retryAfter.provider.listProducers();
    expect(retryAfter.clock.sleeps).toEqual([7000]);

    const always429 = provider("always-429", standardHandler(() => json({}, 429)));
    await expect(always429.provider.listProducers()).rejects.toMatchObject({
      name: "AgencyZoomApiError",
      status: 429,
    });
    expect(always429.clock.sleeps).toEqual([2000, 4000, 8000, 16000, 32000]);
  });
});

describe("AgencyZoom leads", () => {
  it("posts a page-0 search sorted ascending by activity with the watermark date", async () => {
    const { provider: p, calls } = provider(
      "leads-query",
      standardHandler(() => json({ totalCount: 1, page: 0, pageSize: 100, leads: [{ id: 501 }] })),
    );

    const { leads, nextCursor } = await p.listLeads({ activitySince: new Date("2026-06-01T15:30:00Z") });
    expect(leads.map((l) => l.azLeadId)).toEqual(["501"]);
    expect(nextCursor).toBeUndefined();

    const search = calls.find((c) => c.url.includes("/v1/api/leads/list"));
    expect(JSON.parse(String(search!.init?.body))).toEqual({
      pageSize: 100,
      page: 0,
      sort: "lastActivityDate",
      order: "asc",
      lastActivityEarliestDate: "2026-06-01",
    });
  });

  it("pages with a numeric cursor while full pages keep coming", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    let searches = 0;
    const { provider: p } = provider(
      "leads-paging",
      standardHandler(() => {
        searches += 1;
        return json({ leads: searches === 1 ? fullPage : [{ id: 999 }] });
      }),
    );

    const page1 = await p.listLeads({});
    expect(page1.leads).toHaveLength(100);
    expect(page1.nextCursor).toBe("1");

    const page2 = await p.listLeads({ cursor: page1.nextCursor });
    expect(page2.leads).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("normalizes lead fields: status names, cents passthrough, UTC-midnight dates", () => {
    const lead = normalizeAzLead({
      id: 42,
      firstname: "Maya",
      lastname: "Alvarez",
      status: 2,
      assignedTo: 11,
      leadSourceName: "Referral",
      createDate: "2026-06-01",
      quoteDate: "2026-06-10",
      soldDate: "2026-06-12",
      lastActivityDate: "2026-06-12",
      quoted: 128_400,
      premium: 118_800,
    })!;
    expect(lead).toMatchObject({
      azLeadId: "42",
      azProducerId: "11",
      contactName: "Maya Alvarez",
      statusCode: 2,
      status: "won",
      source: "Referral",
      quotedPremiumCents: 128_400,
      soldPremiumCents: 118_800,
    });
    expect(lead.quoteDate?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(lead.soldDate?.toISOString()).toBe("2026-06-12T00:00:00.000Z");

    expect(normalizeAzLead({ status: 1 })).toBeNull(); // no id
    expect(normalizeAzLead({ id: 7 })).toMatchObject({
      statusCode: 0,
      status: "new",
      azProducerId: null,
      contactName: null,
    });
  });

  it("parses AgencyZoom date strings", () => {
    expect(parseAzDate("2026-06-01")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(parseAzDate("2026-06-01 14:30:00")).not.toBeNull();
    expect(parseAzDate("")).toBeNull();
    expect(parseAzDate("not-a-date")).toBeNull();
    expect(toAzDateString(new Date("2026-06-01T15:30:00Z"))).toBe("2026-06-01");
  });
});

describe("AgencyZoom quotes", () => {
  it("fetches and normalizes per-lead quotes", async () => {
    const { provider: p, calls } = provider(
      "quotes",
      standardHandler(() =>
        json([
          { id: 9001, carrierName: "Progressive", productName: "Auto", premium: 96_000, sold: true, effectiveDate: "2026-06-19" },
          { id: 9002, standardProductLineCode: "HOME", premium: 0, sold: false },
          { carrierName: "no id — dropped" },
        ]),
      ),
    );

    const quotes = await p.listLeadQuotes("42");
    expect(calls.some((c) => c.url.endsWith("/v1/api/leads/42/quotes"))).toBe(true);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({
      azQuoteId: "9001",
      azLeadId: "42",
      productLine: "Auto",
      carrier: "Progressive",
      premiumCents: 96_000,
      sold: true,
    });
    expect(quotes[0]!.effectiveDate?.toISOString()).toBe("2026-06-19T00:00:00.000Z");
    expect(quotes[1]).toMatchObject({ azQuoteId: "9002", productLine: "HOME", sold: false });
  });

  it("normalizeAzQuote prefers productName over the standard code", () => {
    expect(normalizeAzQuote({ id: 1, productName: "Auto", standardProductLineCode: "AUTO" }, "7")).toMatchObject({
      productLine: "Auto",
    });
  });
});

describe("AgencyZoom connection status", () => {
  it("reports the owner's name and caches the status", async () => {
    const { provider: p, calls } = provider("status-ok", standardHandler(() => json(EMPLOYEES)));

    expect(await p.checkConnection()).toEqual({
      connected: true,
      mode: "live",
      detail: "Connected — Dana Okafor",
    });

    const before = calls.length;
    expect((await p.checkConnection()).connected).toBe(true);
    expect(calls.length).toBe(before); // served from the 60s cache

    const unconfigured = new AgencyZoomProvider(null);
    expect(await unconfigured.checkConnection()).toEqual({
      connected: false,
      mode: "live",
      detail: "Missing AZ_* credentials",
    });
  });

  it("reports a failure detail when login is rejected", async () => {
    const { provider: p } = provider("status-bad", () => json({ error: "Invalid user name and/or password" }, 400));
    const status = await p.checkConnection();
    expect(status.connected).toBe(false);
    expect(status.detail).toContain("400");
  });
});
