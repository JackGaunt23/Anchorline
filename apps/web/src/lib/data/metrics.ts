// SQL aggregation layer for the dashboard. All numbers on the Overview page
// come from these functions — aggregates over synced rows, never live API
// calls. Metric definitions follow PLAN.md §5; pure math (deltas, close rate,
// badges) lives in @anchorline/metrics.

import { prisma, Prisma } from "@anchorline/db";
import {
  alignedLastNDays,
  assignBadges,
  closeRatePct,
  dayKeys,
  pctDelta,
  priorPeriod,
  ptsDelta,
  type DateRange,
  type SignalBadge,
} from "@anchorline/metrics";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Daily buckets (sparklines + trend chart)
// ---------------------------------------------------------------------------

interface DayRow {
  day: string;
  count: number;
  value: number;
}

/** Calls per UTC day: count + talk seconds. Zero-filled across the range. */
async function dailyCalls(agencyId: string, range: DateRange) {
  const rows = await prisma.$queryRaw<DayRow[]>`
    SELECT to_char(date_trunc('day', start_time AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count,
           COALESCE(SUM(duration_seconds), 0)::int AS value
    FROM calls
    WHERE agency_id = ${agencyId} AND start_time >= ${range.from} AND start_time < ${range.to}
    GROUP BY 1`;
  return zeroFill(range, rows);
}

/** Quotes per UTC day (by quoted_at). */
async function dailyQuotes(agencyId: string, range: DateRange) {
  const rows = await prisma.$queryRaw<DayRow[]>`
    SELECT to_char(date_trunc('day', quoted_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count, 0::int AS value
    FROM quotes
    WHERE agency_id = ${agencyId} AND quoted_at >= ${range.from} AND quoted_at < ${range.to}
    GROUP BY 1`;
  return zeroFill(range, rows);
}

/** Policies per UTC day (by sold_date): count + premium cents. */
async function dailyPolicies(agencyId: string, range: DateRange) {
  const rows = await prisma.$queryRaw<DayRow[]>`
    SELECT to_char(date_trunc('day', sold_date AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count,
           COALESCE(SUM(premium_cents), 0)::int AS value
    FROM policies_sold
    WHERE agency_id = ${agencyId} AND sold_date >= ${range.from} AND sold_date < ${range.to}
    GROUP BY 1`;
  return zeroFill(range, rows);
}

function zeroFill(range: DateRange, rows: DayRow[]): { day: string; count: number; value: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return dayKeys(range).map((day) => ({
    day,
    count: byDay.get(day)?.count ?? 0,
    value: byDay.get(day)?.value ?? 0,
  }));
}

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

export interface OverviewKpis {
  totals: PeriodTotals;
  deltas: {
    calls: number | null;
    talkMinutes: number | null;
    quotes: number | null;
    policies: number | null;
    premium: number | null;
    closeRatePts: number | null;
  };
  sparklines: {
    calls: number[];
    talkMinutes: number[];
    quotes: number[];
    policies: number[];
    /** Monthly premium series in cents (mirrors the premium bar chart). */
    premium: number[];
  };
}

export async function getOverviewKpis(agencyId: string, range: DateRange): Promise<OverviewKpis> {
  const prior = priorPeriod(range);
  const [totals, priorTotals, calls, quotes, policies, premiumMonthly] = await Promise.all([
    periodTotals(agencyId, range),
    periodTotals(agencyId, prior),
    dailyCalls(agencyId, range),
    dailyQuotes(agencyId, range),
    dailyPolicies(agencyId, range),
    getPremiumMonthly(agencyId),
  ]);

  return {
    totals,
    deltas: {
      calls: pctDelta(totals.calls, priorTotals.calls),
      talkMinutes: pctDelta(totals.talkMinutes, priorTotals.talkMinutes),
      quotes: pctDelta(totals.quotes, priorTotals.quotes),
      policies: pctDelta(totals.policies, priorTotals.policies),
      premium: pctDelta(totals.premiumCents, priorTotals.premiumCents),
      closeRatePts: ptsDelta(totals.closeRatePct, priorTotals.closeRatePct),
    },
    sparklines: {
      calls: calls.map((d) => d.count),
      talkMinutes: calls.map((d) => Math.round(d.value / 60)),
      quotes: quotes.map((d) => d.count),
      policies: policies.map((d) => d.count),
      premium: premiumMonthly.months.map((m) => m.premiumCents),
    },
  };
}

// ---------------------------------------------------------------------------
// Trend chart: daily calls & quotes, last 14 days ending at the range end
// ---------------------------------------------------------------------------

export interface TrendDay {
  day: string;
  calls: number;
  quotes: number;
}

export async function getTrend(agencyId: string, rangeTo: Date, days = 14): Promise<TrendDay[]> {
  const range: DateRange = { from: new Date(rangeTo.getTime() - days * DAY_MS), to: rangeTo };
  const [calls, quotes] = await Promise.all([dailyCalls(agencyId, range), dailyQuotes(agencyId, range)]);
  return calls.map((c, i) => ({ day: c.day, calls: c.count, quotes: quotes[i]?.count ?? 0 }));
}

// ---------------------------------------------------------------------------
// Premium by month: 5 whole calendar months + a trailing-30-day bar
// (mirrors the mockup: the current-month bar reads "Jul (Last 30d)")
// ---------------------------------------------------------------------------

export interface PremiumMonth {
  /** "2026-02" for calendar months. */
  month: string;
  label: string;
  premiumCents: number;
  isCurrent: boolean;
}

export async function getPremiumMonthly(agencyId: string, now = new Date()): Promise<{ months: PremiumMonth[] }> {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const last30 = alignedLastNDays(30, now);

  const [monthRows, trailing] = await Promise.all([
    prisma.$queryRaw<{ month: string; cents: number }[]>`
      SELECT to_char(date_trunc('month', sold_date AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
             COALESCE(SUM(premium_cents), 0)::int AS cents
      FROM policies_sold
      WHERE agency_id = ${agencyId} AND sold_date >= ${firstMonthStart} AND sold_date < ${currentMonthStart}
      GROUP BY 1`,
    prisma.policySold.aggregate({
      where: { agencyId, soldDate: { gte: last30.from, lt: last30.to } },
      _sum: { premiumCents: true },
    }),
  ]);

  const byMonth = new Map(monthRows.map((r) => [r.month, r.cents]));
  const months: PremiumMonth[] = [];
  for (let i = 5; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      premiumCents: byMonth.get(key) ?? 0,
      isCurrent: false,
    });
  }
  months.push({
    month: currentMonthStart.toISOString().slice(0, 7),
    label: `${currentMonthStart.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} (Last 30d)`,
    premiumCents: trailing._sum.premiumCents ?? 0,
    isCurrent: true,
  });
  return { months };
}

// ---------------------------------------------------------------------------
// Producer performance rows (table, bubble chart, leaderboard)
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

// ---------------------------------------------------------------------------
// Scored calls (producer drill-down modal)
// ---------------------------------------------------------------------------

export interface ScoredCall {
  callId: string;
  startTime: Date;
  durationSeconds: number;
  score: number;
  summary: string;
  steps: {
    rapport: boolean;
    discovery: boolean;
    quote: boolean;
    objection: boolean;
    close: boolean;
  };
}

export async function getScoredCalls(
  agencyId: string,
  producerId: string,
  page = 0,
  pageSize = 10,
): Promise<{ calls: ScoredCall[]; total: number }> {
  const producer = await prisma.producerIdentityMap.findFirst({ where: { id: producerId, agencyId } });
  if (!producer?.rcExtensionId) return { calls: [], total: 0 };

  const where = { agencyId, call: { rcExtensionId: producer.rcExtensionId } } satisfies Prisma.CallScoreWhereInput;
  const [total, scores] = await Promise.all([
    prisma.callScore.count({ where }),
    prisma.callScore.findMany({
      where,
      include: { call: { select: { startTime: true, durationSeconds: true } } },
      orderBy: { call: { startTime: "desc" } },
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    calls: scores.map((s) => ({
      callId: s.callId,
      startTime: s.call.startTime,
      durationSeconds: s.call.durationSeconds,
      score: s.score,
      summary: s.summaryText,
      steps: {
        rapport: s.rapport,
        discovery: s.discovery,
        quote: s.quotePresented,
        objection: s.objectionHandling,
        close: s.closeAttempted,
      },
    })),
  };
}
