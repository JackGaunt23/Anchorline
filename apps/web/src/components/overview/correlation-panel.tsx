"use client";

// Process adherence vs. close rate bubble chart (bubble size = premium).
// Bubbles are labeled with first names and click through to the modal.

import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, CartesianGrid, Label } from "recharts";
import { fmtCurrency, fmtPct } from "@/lib/format";
import type { ProducerRowView } from "@/lib/views";
import { Panel, PanelHead } from "../ui";
import { niceCeil, TooltipCard } from "./chart-bits";
import { useProducerModal } from "./producer-modal";

interface Bubble {
  id: string;
  firstName: string;
  name: string;
  score: number;
  close: number;
  premium: number;
}

export function CorrelationPanel({ rows }: { rows: ProducerRowView[] }) {
  const { openProducer } = useProducerModal();

  const bubbles: Bubble[] = rows
    .filter((p) => p.processScore != null && p.closeRatePct != null)
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      name: p.displayName,
      score: p.processScore!,
      close: p.closeRatePct!,
      premium: p.premiumDollars,
    }));

  const yMax = niceCeil(Math.max(1, ...bubbles.map((b) => b.close)) * 1.25);
  const minPrem = Math.min(...bubbles.map((b) => b.premium));
  const maxPrem = Math.max(...bubbles.map((b) => b.premium));
  const radius = (premium: number) => 13 + ((premium - minPrem) / (maxPrem - minPrem || 1)) * 20;

  return (
    <Panel>
      <PanelHead title="Process adherence vs. close rate" sub="Bubble size = premium written" />
      <div className="h-[280px] w-full">
        {bubbles.length === 0 ? (
          <p className="flex h-full items-center justify-center text-[12.5px] text-ink-muted">No scored producers in range.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 24, bottom: 14, left: -12 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis
                type="number"
                dataKey="score"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(t: number) => `${t}%`}
                tickLine={false}
                axisLine={false}
              >
                <Label value="Sales process score" position="bottom" offset={-2} className="chart-axis-label" style={{ fontWeight: 600 }} />
              </XAxis>
              <YAxis
                type="number"
                dataKey="close"
                domain={[0, yMax]}
                ticks={[0, yMax / 2, yMax]}
                tickFormatter={(t: number) => fmtPct(t, 0)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0]!.payload as Bubble;
                  return (
                    <TooltipCard
                      title={b.name}
                      rows={[
                        { name: "Process score", value: `${b.score}%` },
                        { name: "Close rate", value: fmtPct(b.close) },
                        { name: "Premium", value: fmtCurrency(b.premium) },
                      ]}
                    />
                  );
                }}
              />
              <Scatter
                data={bubbles}
                isAnimationActive={false}
                onClick={(point: { payload?: Bubble }) => point?.payload && openProducer(point.payload.id)}
                shape={(props: unknown) => {
                  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload: Bubble };
                  if (cx == null || cy == null) return <g />;
                  const r = radius(payload.premium);
                  return (
                    <g style={{ cursor: "pointer" }}>
                      <circle cx={cx} cy={cy} r={r} fill="var(--gold)" fillOpacity={0.55} stroke="var(--gold)" strokeWidth={1.5} />
                      <text
                        className="chart-axis-label"
                        x={cx}
                        y={cy - r - 6}
                        textAnchor="middle"
                        fill="var(--ink-secondary)"
                        fontWeight={600}
                      >
                        {payload.firstName}
                      </text>
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
