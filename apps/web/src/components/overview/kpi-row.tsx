"use client";

// KPI tiles: value, delta vs prior period, sparkline (or close-rate meter).
// Pulses (teal glow) when a sync updates the underlying figure.

import { fmtPct } from "@/lib/format";
import type { KpiView } from "@/lib/views";
import { useKpiPulse } from "../pulse";
import { IconClock, IconDoc, IconDollar, IconDown, IconPhone, IconShield, IconTarget, IconUp } from "../icons";

const ICONS: Record<KpiView["key"], React.ComponentType<{ size?: number }>> = {
  calls: IconPhone,
  talk: IconClock,
  quotes: IconDoc,
  policies: IconShield,
  premium: IconDollar,
  close: IconTarget,
};

export function KpiRow({ kpis }: { kpis: KpiView[] }) {
  return (
    <section className="grid grid-cols-2 gap-3.5 min-[641px]:grid-cols-3 min-[1181px]:grid-cols-6" aria-label="Key metrics">
      {kpis.map((kpi) => (
        <KpiTile key={kpi.key} kpi={kpi} />
      ))}
    </section>
  );
}

function KpiTile({ kpi }: { kpi: KpiView }) {
  const pulsing = useKpiPulse(kpi.key);
  const Icon = ICONS[kpi.key];

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-md border border-hairline bg-card px-4 pb-4 pt-3.5 shadow-card transition-shadow duration-150 ${
        pulsing ? "kpi-pulse" : ""
      }`}
      data-kpi={kpi.key}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-secondary">{kpi.label}</span>
        <span className="flex-none text-ink-muted">
          <Icon />
        </span>
      </div>
      <div className="font-mono text-[22px] font-semibold tracking-[-0.01em]">{kpi.value}</div>
      {kpi.meterPct !== undefined ? (
        <div className="flex min-h-[30px] w-full flex-col justify-center gap-1.5">
          <Delta deltaPct={kpi.deltaPct} />
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(kpi.meterPct, 100)}%`, background: kpi.color }}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[30px] items-center justify-between gap-2">
          <Delta deltaPct={kpi.deltaPct} />
          {kpi.spark && <Sparkline values={kpi.spark} color={kpi.color} />}
        </div>
      )}
    </div>
  );
}

function Delta({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-muted">
        — <span className="font-medium">vs last period</span>
      </span>
    );
  }
  const up = deltaPct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? "text-good" : "text-critical"}`}>
      {up ? <IconUp /> : <IconDown />}
      {fmtPct(Math.abs(deltaPct))}
      <span className="font-medium text-ink-muted">vs last period</span>
    </span>
  );
}

/** Tiny inline sparkline (area + line), same geometry as the mockup. */
function Sparkline({ values, color, w = 84, h = 30, pad = 2 }: { values: number[]; color: string; w?: number; h?: number; pad?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) * 1.1 || 1;
  const min = Math.min(...values) * 0.9;
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]!.toFixed(1)},${p[1]!.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0]!.toFixed(1)},${h} L${pts[0]![0]!.toFixed(1)},${h} Z`;

  return (
    <svg className="block" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
