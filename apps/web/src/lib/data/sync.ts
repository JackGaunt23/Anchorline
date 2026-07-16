// Manual sync. Demo mode runs a small inline "sample sync" that mirrors the
// mockup's demo buttons — a handful of fresh calls (RingCentral) or a couple
// of sold policies (AgencyZoom), minute-seeded so double-clicks within the
// same minute are idempotent. Live mode enqueues a worker job for the real
// sync handlers (apps/worker/src/handlers/).

import { prisma } from "@anchorline/db";
import { AZ_LEAD_STATUS, getCallProvider, isDemoMode } from "@anchorline/providers";
import { mulberry32, pick, randInt, CARRIERS, LEAD_SOURCES, PRODUCT_LINES } from "@anchorline/providers/mock";

export type SyncSourceName = "ringcentral" | "agencyzoom";

export interface SyncResult {
  source: SyncSourceName;
  mode: "demo" | "queued";
  /** Toast copy for the UI. */
  title: string;
  body: string;
  /** KPI tiles to pulse after refresh. */
  pulse: string[];
}

export async function runManualSync(agencyId: string, source: SyncSourceName): Promise<SyncResult> {
  if (!isDemoMode()) {
    await prisma.job.create({ data: { agencyId, type: `sync_${source}` } });
    return {
      source,
      mode: "queued",
      title: "Sync queued",
      body: `A ${source === "ringcentral" ? "RingCentral" : "AgencyZoom"} sync job was queued for the worker.`,
      pulse: [],
    };
  }
  return source === "ringcentral" ? demoRingCentralSync(agencyId) : demoAgencyZoomSync(agencyId);
}

/** Pull the mock provider's fresh minute-seeded calls and upsert them. */
async function demoRingCentralSync(agencyId: string): Promise<SyncResult> {
  const started = new Date();
  const from = new Date(started.getTime() - 15 * 60_000);
  const { calls } = await getCallProvider().listCalls({ from });
  const fresh = calls.filter((c) => c.rcSessionId.startsWith("demo-rc-live-"));

  let added = 0;
  let talkSeconds = 0;
  for (const c of fresh) {
    const existing = await prisma.call.findUnique({
      where: { agencyId_rcSessionId: { agencyId, rcSessionId: c.rcSessionId } },
    });
    if (existing) continue;
    await prisma.call.create({
      data: {
        agencyId,
        rcSessionId: c.rcSessionId,
        rcExtensionId: c.rcExtensionId,
        direction: c.direction,
        startTime: c.startTime,
        durationSeconds: c.durationSeconds,
        result: c.result,
        fromNumber: c.fromNumber,
        toNumber: c.toNumber,
        contactName: c.contactName,
        counterpartyNumber: c.counterpartyNumber,
        hasRecording: c.hasRecording,
        recordingContentUri: c.recordingContentUri,
        raw: c.raw as object,
      },
    });
    added += 1;
    talkSeconds += c.durationSeconds;
  }

  await prisma.syncRun.create({
    data: {
      agencyId,
      source: "ringcentral",
      status: "success",
      startedAt: started,
      finishedAt: new Date(),
      watermarkFrom: from,
      watermarkTo: new Date(),
      recordsUpserted: added,
    },
  });

  const talkMin = Math.round(talkSeconds / 60);
  return {
    source: "ringcentral",
    mode: "demo",
    title: "Demo sync complete",
    body:
      added > 0
        ? `${added} sample call${added === 1 ? "" : "s"} added (${Math.floor(talkMin / 60)}h ${talkMin % 60}m talk time). No live system was contacted.`
        : "Already up to date — no new sample calls this minute. No live system was contacted.",
    pulse: added > 0 ? ["calls", "talk"] : [],
  };
}

/** Add 1–3 freshly "sold" sample policies (with their won leads). */
async function demoAgencyZoomSync(agencyId: string): Promise<SyncResult> {
  const started = new Date();
  const minuteKey = Math.floor(started.getTime() / 60_000);
  const rng = mulberry32(minuteKey);

  const producers = await prisma.producerIdentityMap.findMany({
    where: { agencyId, active: true, azProducerId: { not: null } },
  });

  const count = randInt(rng, 1, 3);
  let added = 0;
  let premiumCents = 0;
  for (let i = 0; i < count && producers.length > 0; i++) {
    const azLeadId = `demo-az-live-${minuteKey}-${i}`;
    const existing = await prisma.lead.findUnique({ where: { agencyId_azLeadId: { agencyId, azLeadId } } });
    if (existing) continue;

    const producer = pick(rng, producers);
    const cents = randInt(rng, 2400, 3300) * 100;
    const productLine = pick(rng, PRODUCT_LINES);
    const lead = await prisma.lead.create({
      data: {
        agencyId,
        azLeadId,
        azProducerId: producer.azProducerId,
        contactName: `Demo Household ${minuteKey}-${i + 1}`,
        statusCode: 2,
        status: AZ_LEAD_STATUS[2]!,
        source: pick(rng, LEAD_SOURCES),
        createDate: new Date(started.getTime() - randInt(rng, 3, 14) * 86_400_000),
        soldDate: started,
        lastActivityDate: started,
        soldPremiumCents: cents,
        raw: { demo: true, live: true },
      },
    });
    await prisma.policySold.create({
      data: {
        agencyId,
        leadId: lead.id,
        azProducerId: producer.azProducerId,
        productLine,
        premiumCents: cents,
        soldDate: started,
        raw: { demo: true, live: true, carrier: pick(rng, CARRIERS) },
      },
    });
    added += 1;
    premiumCents += cents;
  }

  await prisma.syncRun.create({
    data: {
      agencyId,
      source: "agencyzoom",
      status: "success",
      startedAt: started,
      finishedAt: new Date(),
      watermarkTo: new Date(),
      recordsUpserted: added,
    },
  });

  const premium = Math.round(premiumCents / 100).toLocaleString("en-US");
  return {
    source: "agencyzoom",
    mode: "demo",
    title: "Demo sync complete",
    body:
      added > 0
        ? `${added} sample polic${added === 1 ? "y" : "ies"} added ($${premium} premium). No live system was contacted.`
        : "Already up to date — no new sample policies this minute. No live system was contacted.",
    pulse: added > 0 ? ["policies", "premium", "close"] : [],
  };
}
