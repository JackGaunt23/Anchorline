// Overview — the dashboard. A server component: every number is a SQL
// aggregate over synced rows, assembled by the lib/data layer and passed to
// client components for interactivity.

import { BADGE_LABELS } from "@anchorline/metrics";
import { isDemoMode } from "@anchorline/providers";
import { getAgency } from "@/lib/data/agency";
import { getOverviewKpis, getPremiumMonthly, getProducerRows, getTrend } from "@/lib/data/metrics";
import { getLatestSummary } from "@/lib/data/summary";
import { fmtCurrencyCompact, fmtInt, fmtMinutes, fmtPct, initials } from "@/lib/format";
import { resolveRange } from "@/lib/range";
import type { KpiView, ProducerRowView, SummaryView } from "@/lib/views";
import { KpiRow } from "@/components/overview/kpi-row";
import { TrendPanel } from "@/components/overview/trend-panel";
import { PremiumPanel } from "@/components/overview/premium-panel";
import { ProducerModalProvider } from "@/components/overview/producer-modal";
import { ProducerTable } from "@/components/overview/producer-table";
import { CorrelationPanel } from "@/components/overview/correlation-panel";
import { Leaderboard } from "@/components/overview/leaderboard";
import { AiSummaryPanel } from "@/components/overview/ai-summary";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const { range } = resolveRange(params);
  const agency = await getAgency();
  const demo = isDemoMode();

  const [kpis, trend, premium, producers, summary] = await Promise.all([
    getOverviewKpis(agency.id, range),
    getTrend(agency.id, range.to),
    getPremiumMonthly(agency.id),
    getProducerRows(agency.id, range),
    getLatestSummary(agency.id),
  ]);

  const kpiViews: KpiView[] = [
    {
      key: "calls",
      label: "Total calls",
      value: fmtInt(kpis.totals.calls),
      deltaPct: kpis.deltas.calls,
      spark: kpis.sparklines.calls,
      color: "var(--teal)",
    },
    {
      key: "talk",
      label: "Talk time",
      value: fmtMinutes(kpis.totals.talkMinutes),
      deltaPct: kpis.deltas.talkMinutes,
      spark: kpis.sparklines.talkMinutes,
      color: "var(--teal)",
    },
    {
      key: "quotes",
      label: "Quotes generated",
      value: fmtInt(kpis.totals.quotes),
      deltaPct: kpis.deltas.quotes,
      spark: kpis.sparklines.quotes,
      color: "var(--slate)",
    },
    {
      key: "policies",
      label: "Policies sold",
      value: fmtInt(kpis.totals.policies),
      deltaPct: kpis.deltas.policies,
      spark: kpis.sparklines.policies,
      color: "var(--gold)",
    },
    {
      key: "premium",
      label: "Premium written",
      value: fmtCurrencyCompact(kpis.totals.premiumCents / 100),
      deltaPct: kpis.deltas.premium,
      spark: kpis.sparklines.premium,
      color: "var(--gold)",
    },
    {
      key: "close",
      label: "Close rate",
      value: kpis.totals.closeRatePct != null ? fmtPct(kpis.totals.closeRatePct) : "—",
      deltaPct: kpis.deltas.closeRatePts,
      meterPct: (kpis.totals.closeRatePct ?? 0) * 3,
      color: "var(--teal)",
    },
  ];

  const producerViews: ProducerRowView[] = producers.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    firstName: p.displayName.split(" ")[0] ?? p.displayName,
    roleTitle: p.roleTitle,
    initials: initials(p.displayName),
    badgeLabel: BADGE_LABELS[p.badge].label,
    badgeTone: BADGE_LABELS[p.badge].tone,
    calls: p.calls,
    talkMinutes: p.talkMinutes,
    processScore: p.processScore,
    quotes: p.quotes,
    policies: p.policies,
    premiumDollars: p.premiumCents / 100,
    closeRatePct: p.closeRatePct,
  }));

  const summaryView: SummaryView | null = summary
    ? {
        summaryText: summary.summaryText,
        insights: summary.insights,
        generatedAtIso: summary.generatedAt.toISOString(),
        model: summary.model,
      }
    : null;

  const premiumViews = premium.months.map((m) => ({
    label: m.label,
    premiumDollars: m.premiumCents / 100,
    isCurrent: m.isCurrent,
  }));

  return (
    <main className="flex max-w-[1360px] flex-col gap-[22px] px-7 pb-12 pt-[22px]">
      <KpiRow kpis={kpiViews} />

      <section className="grid grid-cols-1 items-stretch gap-4 min-[981px]:grid-cols-[1.35fr_1fr]">
        <TrendPanel days={trend} />
        <PremiumPanel months={premiumViews} />
      </section>

      <ProducerModalProvider producers={producerViews} timezone={agency.timezone}>
        <ProducerTable rows={producerViews} />
        <section className="grid grid-cols-1 items-stretch gap-4 min-[981px]:grid-cols-2">
          <CorrelationPanel rows={producerViews} />
          <Leaderboard rows={producerViews} />
        </section>
      </ProducerModalProvider>

      <AiSummaryPanel initial={summaryView} demo={demo} timezone={agency.timezone} />

      {demo && (
        <p className="pb-1 pt-1.5 text-center text-[11.5px] text-ink-muted">
          All figures on this page are synthetic sample data for demonstration purposes.
        </p>
      )}
    </main>
  );
}
