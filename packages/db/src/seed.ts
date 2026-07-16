// Seed script.
//
// Always: seeds the single agency row and the owner login (from env).
// In demo mode (DATA_MODE=demo, the default): resets and inserts the
// deterministic demo dataset so the dashboard reproduces the mockup —
// 1,755 calls / 481 quotes / 70 policies / $187,600 over the last 30 days,
// the five named producers, 20 scripted scored calls with transcripts, and
// a generated daily summary.
//
// Idempotent per day: demo tables are cleared and re-inserted each run.

import bcrypt from "bcryptjs";
import { Prisma, prisma } from "./index";
import {
  demoAnchor,
  generateDemoDataset,
  buildDemoSummary,
  DEMO_MODEL,
  DEMO_PROMPT_VERSION,
  PRODUCERS,
  type DemoSummaryStats,
} from "@anchorline/providers/mock";

const CHUNK = 1000;

async function chunked<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK));
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value === "change-me") {
    throw new Error(`Missing required env var ${name} — copy .env.example to .env and set it.`);
  }
  return value;
}

async function main() {
  const dataMode = process.env.DATA_MODE === "live" ? "live" : "demo";
  const ownerEmail = requireEnv("OWNER_EMAIL");
  const ownerPassword = requireEnv("OWNER_PASSWORD");
  const ownerName = process.env.OWNER_NAME ?? "Agency Owner";
  const agencyName = process.env.AGENCY_NAME ?? "Anchorline Insurance Group";
  const agencyTimezone = process.env.AGENCY_TIMEZONE ?? "America/New_York";

  // --- Agency + owner (both modes) ----------------------------------------
  const agency =
    (await prisma.agency.findFirst()) ??
    (await prisma.agency.create({ data: { name: agencyName, timezone: agencyTimezone } }));

  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { passwordHash, name: ownerName },
    create: { agencyId: agency.id, email: ownerEmail, passwordHash, name: ownerName },
  });
  console.log(`Agency "${agency.name}" ready; owner login ${ownerEmail} upserted.`);

  if (dataMode !== "demo") {
    console.log(
      "DATA_MODE=live — skipping demo dataset; producer identity mapping is left to Settings.",
    );
    return;
  }

  // --- Producer identity map (demo fixtures) ------------------------------
  for (const p of PRODUCERS) {
    await prisma.producerIdentityMap.upsert({
      where: { agencyId_rcExtensionId: { agencyId: agency.id, rcExtensionId: p.rcExtensionId } },
      update: {
        displayName: p.displayName,
        roleTitle: p.roleTitle,
        azProducerId: p.azProducerId,
        isRamping: p.isRamping,
        active: true,
      },
      create: {
        agencyId: agency.id,
        displayName: p.displayName,
        roleTitle: p.roleTitle,
        rcExtensionId: p.rcExtensionId,
        azProducerId: p.azProducerId,
        isRamping: p.isRamping,
      },
    });
  }
  console.log(`Identity map: ${PRODUCERS.length} demo producers upserted.`);

  // --- Demo dataset --------------------------------------------------------
  const anchor = demoAnchor();
  const dataset = generateDemoDataset(anchor);
  console.log(
    `Generated demo dataset: ${dataset.calls.length} calls, ${dataset.leads.length} leads, ` +
      `${dataset.quotes.length} quotes, ${dataset.policies.length} policies, ${dataset.scoredCalls.length} scored calls.`,
  );

  // Reset demo data (order respects FKs; transcripts/scores cascade off calls).
  await prisma.dailySummary.deleteMany({ where: { agencyId: agency.id } });
  await prisma.job.deleteMany({ where: { agencyId: agency.id } });
  await prisma.syncRun.deleteMany({ where: { agencyId: agency.id } });
  await prisma.callLog.deleteMany({ where: { agencyId: agency.id } });
  await prisma.call.deleteMany({ where: { agencyId: agency.id } });
  await prisma.lead.deleteMany({ where: { agencyId: agency.id } });

  // Calls.
  await chunked(dataset.calls, (batch) =>
    prisma.call.createMany({
      data: batch.map((c) => ({
        agencyId: agency.id,
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
        raw: c.raw as Prisma.InputJsonValue,
      })),
    }),
  );

  // Leads.
  await chunked(dataset.leads, (batch) =>
    prisma.lead.createMany({
      data: batch.map((l) => ({
        agencyId: agency.id,
        azLeadId: l.azLeadId,
        azProducerId: l.azProducerId,
        contactName: l.contactName,
        statusCode: l.statusCode,
        status: l.status,
        source: l.source,
        createDate: l.createDate,
        contactDate: l.contactDate,
        quoteDate: l.quoteDate,
        soldDate: l.soldDate,
        lastActivityDate: l.lastActivityDate,
        quotedPremiumCents: l.quotedPremiumCents,
        soldPremiumCents: l.soldPremiumCents,
        raw: l.raw as Prisma.InputJsonValue,
      })),
    }),
  );

  // Map AZ ids -> db ids for quotes/policies.
  const leadRows = await prisma.lead.findMany({
    where: { agencyId: agency.id },
    select: { id: true, azLeadId: true, azProducerId: true, quoteDate: true, lastActivityDate: true },
  });
  const leadIdByAz = new Map(leadRows.map((l) => [l.azLeadId, l]));

  // Quotes (quoted_at = the lead's quoteDate; see PLAN.md open item 1).
  await chunked(dataset.quotes, (batch) =>
    prisma.quote.createMany({
      data: batch.flatMap((q) => {
        const lead = leadIdByAz.get(q.azLeadId);
        if (!lead) return [];
        const quotedAt = lead.quoteDate ?? lead.lastActivityDate ?? anchor;
        return [
          {
            agencyId: agency.id,
            azQuoteId: q.azQuoteId,
            leadId: lead.id,
            azProducerId: lead.azProducerId,
            productLine: q.productLine,
            carrier: q.carrier,
            premiumCents: q.premiumCents,
            sold: q.sold,
            quotedAt,
            firstSeenAt: quotedAt,
            raw: q.raw as Prisma.InputJsonValue,
          },
        ];
      }),
    }),
  );

  // Sold policies.
  await chunked(dataset.policies, (batch) =>
    prisma.policySold.createMany({
      data: batch.flatMap((p) => {
        const lead = leadIdByAz.get(p.azLeadId);
        if (!lead) return [];
        return [
          {
            agencyId: agency.id,
            leadId: lead.id,
            azProducerId: p.azProducerId,
            productLine: p.productLine,
            premiumCents: p.premiumCents,
            soldDate: p.soldDate,
            effectiveDate: p.effectiveDate,
          },
        ];
      }),
    }),
  );

  // Transcripts + scores for the scored calls.
  const callRows = await prisma.call.findMany({
    where: { agencyId: agency.id, rcSessionId: { in: dataset.scoredCalls.map((s) => s.rcSessionId) } },
    select: { id: true, rcSessionId: true },
  });
  const callIdBySession = new Map(callRows.map((c) => [c.rcSessionId, c.id]));

  await chunked(dataset.scoredCalls, (batch) =>
    prisma.callTranscript.createMany({
      data: batch.flatMap((s) => {
        const callId = callIdBySession.get(s.rcSessionId);
        if (!callId) return [];
        return [
          {
            agencyId: agency.id,
            callId,
            provider: "demo",
            transcriptText: s.transcript,
            status: "done" as const,
          },
        ];
      }),
    }),
  );

  await chunked(dataset.scoredCalls, (batch) =>
    prisma.callScore.createMany({
      data: batch.flatMap((s) => {
        const callId = callIdBySession.get(s.rcSessionId);
        if (!callId) return [];
        return [
          {
            agencyId: agency.id,
            callId,
            score: s.score,
            rapport: s.steps.rapport,
            discovery: s.steps.discovery,
            quotePresented: s.steps.quote,
            objectionHandling: s.steps.objection,
            closeAttempted: s.steps.close,
            summaryText: s.summary,
            model: DEMO_MODEL,
            promptVersion: DEMO_PROMPT_VERSION,
          },
        ];
      }),
    }),
  );

  // Successful sync runs so Settings shows a healthy last-sync state.
  const now = new Date();
  await prisma.syncRun.createMany({
    data: (["ringcentral", "agencyzoom"] as const).map((source) => ({
      agencyId: agency.id,
      source,
      status: "success" as const,
      startedAt: new Date(now.getTime() - 8 * 60_000),
      finishedAt: new Date(now.getTime() - 7 * 60_000),
      watermarkFrom: new Date(anchor.getTime() - 60 * 86_400_000),
      watermarkTo: now,
      recordsUpserted: source === "ringcentral" ? dataset.calls.length : dataset.leads.length + dataset.quotes.length,
    })),
  });

  // Daily summary generated from the seeded aggregates.
  const totals = PRODUCERS.reduce(
    (acc, p) => {
      acc.calls += p.current.calls;
      acc.talk += p.current.talkMinutes;
      acc.quotes += p.current.quotes;
      acc.policies += p.current.policies;
      acc.premium += p.current.premiumDollars;
      acc.priorQuotes += p.prior.quotes;
      acc.priorPolicies += p.prior.policies;
      return acc;
    },
    { calls: 0, talk: 0, quotes: 0, policies: 0, premium: 0, priorQuotes: 0, priorPolicies: 0 },
  );
  const closeRate = (totals.policies / totals.quotes) * 100;
  const priorCloseRate = (totals.priorPolicies / totals.priorQuotes) * 100;
  const stats: DemoSummaryStats = {
    totalCalls: totals.calls,
    talkMinutes: totals.talk,
    quotes: totals.quotes,
    policies: totals.policies,
    premiumDollars: totals.premium,
    closeRatePct: closeRate,
    closeRateDeltaPts: closeRate - priorCloseRate,
    producers: PRODUCERS.map((p) => ({
      name: p.displayName,
      processScore: p.current.processScore,
      prevProcessScore: p.prior.processScore,
      closeRatePct: (p.current.policies / p.current.quotes) * 100,
      premiumDollars: p.current.premiumDollars,
      isRamping: p.isRamping,
    })),
  };
  const summary = buildDemoSummary(stats, 0);
  // Same for_date convention as the generate_daily_summary job: the current
  // date in the agency's time zone (en-CA formats as YYYY-MM-DD).
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: agency.timezone, dateStyle: "short" }).format(now);
  await prisma.dailySummary.create({
    data: {
      agencyId: agency.id,
      forDate: new Date(`${localDate}T00:00:00Z`),
      summaryText: summary.summaryText,
      insights: summary.insights as unknown as Prisma.InputJsonValue,
      model: DEMO_MODEL,
    },
  });

  const counts = {
    calls: await prisma.call.count({ where: { agencyId: agency.id } }),
    leads: await prisma.lead.count({ where: { agencyId: agency.id } }),
    quotes: await prisma.quote.count({ where: { agencyId: agency.id } }),
    policies: await prisma.policySold.count({ where: { agencyId: agency.id } }),
    transcripts: await prisma.callTranscript.count({ where: { agencyId: agency.id } }),
    scores: await prisma.callScore.count({ where: { agencyId: agency.id } }),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
