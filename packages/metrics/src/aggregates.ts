// Shared SQL aggregates over synced rows (PLAN §5/§6). Moved here from the
// web data layer in Phase 5 so the worker's daily-summary job and the web
// dashboard compute period totals and producer rows from the same code.
// UI-specific aggregates (sparkline buckets, premium-by-month, scored-call
// pages) stay in apps/web/src/lib/data/metrics.ts.

import { prisma } from "@anchorline/db";
import { assignBadges, type SignalBadge } from "./badges";
import { closeRatePct, priorPeriod, type DateRange } from "./periods";

// ---------------------------------------------------------------------------
// Period totals (KPIs)
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  calls: number;
  talkMinutes: number;
  quotes: number;
  policies: number;
  premiumCents: number;
  closeRatePct: number | null;
}

export async function periodTotals(agencyId: string, range: DateRange): Promise<PeriodTotals> {
  const [callsAgg, quotes, policiesAgg] = await Promise.all([
    prisma.call.aggregate({
      where: { agencyId, startTime: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { durationSeconds: true },
    }),
    prisma.quote.count({ where: { agencyId, quotedAt: { gte: range.from, lt: range.to } } }),
    prisma.policySold.aggregate({
      where: { agencyId, soldDate: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { premiumCents: true },
    }),
  ]);
  const policies = policiesAgg._count._all;
  return {
    calls: callsAgg._count._all,
    talkMinutes: (callsAgg._sum.durationSeconds ?? 0) / 60,
    quotes,
    policies,
    premiumCents: policiesAgg._sum.premiumCents ?? 0,
    closeRatePct: closeRatePct(policies, quotes),
  };
}

// ---------------------------------------------------------------------------
// Producer performance rows (table, bubble chart, leaderboard, summaries)
// ---------------------------------------------------------------------------

export interface ProducerRow {
  id: string;
  displayName: string;
  roleTitle: string;
  rcExtensionId: string | null;
  azProducerId: string | null;
  isRamping: boolean;
  calls: number;
  talkMinutes: number;
  /** Mean call score in range (rounded); null when no scored calls. */
  processScore: number | null;
  priorProcessScore: number | null;
  quotes: number;
  policies: number;
  premiumCents: number;
  closeRatePct: number | null;
  badge: SignalBadge;
}

interface ScoreAvgRow {
  ext: string | null;
  avg: number;
}

async function scoreAvgsByExtension(agencyId: string, range: DateRange): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<ScoreAvgRow[]>`
    SELECT c.rc_extension_id AS ext, AVG(s.score_0_100)::float AS avg
    FROM call_scores s
    JOIN calls c ON c.id = s.call_id
    WHERE c.agency_id = ${agencyId} AND c.start_time >= ${range.from} AND c.start_time < ${range.to}
    GROUP BY 1`;
  return new Map(rows.filter((r) => r.ext != null).map((r) => [r.ext as string, r.avg]));
}

export async function getProducerRows(agencyId: string, range: DateRange): Promise<ProducerRow[]> {
  const prior = priorPeriod(range);
  const [producers, callAgg, scoreAvgs, priorScoreAvgs, quoteAgg, policyAgg] = await Promise.all([
    prisma.producerIdentityMap.findMany({ where: { agencyId, active: true }, orderBy: { displayName: "asc" } }),
    prisma.call.groupBy({
      by: ["rcExtensionId"],
      where: { agencyId, startTime: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { durationSeconds: true },
    }),
    scoreAvgsByExtension(agencyId, range),
    scoreAvgsByExtension(agencyId, prior),
    prisma.quote.groupBy({
      by: ["azProducerId"],
      where: { agencyId, quotedAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    prisma.policySold.groupBy({
      by: ["azProducerId"],
      where: { agencyId, soldDate: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { premiumCents: true },
    }),
  ]);

  const callsByExt = new Map(callAgg.map((r) => [r.rcExtensionId, r]));
  const quotesByAz = new Map(quoteAgg.map((r) => [r.azProducerId, r._count._all]));
  const policiesByAz = new Map(policyAgg.map((r) => [r.azProducerId, r]));

  const rows = producers.map((p) => {
    const c = p.rcExtensionId ? callsByExt.get(p.rcExtensionId) : undefined;
    const quotes = p.azProducerId ? (quotesByAz.get(p.azProducerId) ?? 0) : 0;
    const pol = p.azProducerId ? policiesByAz.get(p.azProducerId) : undefined;
    const policies = pol?._count._all ?? 0;
    const scoreAvg = p.rcExtensionId ? scoreAvgs.get(p.rcExtensionId) : undefined;
    const priorAvg = p.rcExtensionId ? priorScoreAvgs.get(p.rcExtensionId) : undefined;
    return {
      id: p.id,
      displayName: p.displayName,
      roleTitle: p.roleTitle,
      rcExtensionId: p.rcExtensionId,
      azProducerId: p.azProducerId,
      isRamping: p.isRamping,
      calls: c?._count._all ?? 0,
      talkMinutes: (c?._sum.durationSeconds ?? 0) / 60,
      processScore: scoreAvg != null ? Math.round(scoreAvg) : null,
      priorProcessScore: priorAvg != null ? Math.round(priorAvg) : null,
      quotes,
      policies,
      premiumCents: pol?._sum.premiumCents ?? 0,
      closeRatePct: closeRatePct(policies, quotes),
      badge: "on_pace" as SignalBadge,
    };
  });

  const badges = assignBadges(
    rows.map((r) => ({
      id: r.id,
      calls: r.calls,
      processScore: r.processScore,
      priorProcessScore: r.priorProcessScore,
      closeRatePct: r.closeRatePct,
      isRamping: r.isRamping,
    })),
  );
  for (const r of rows) r.badge = badges.get(r.id) ?? "on_pace";

  // Table/leaderboard order: premium written, descending (mockup).
  return rows.sort((a, b) => b.premiumCents - a.premiumCents);
}
