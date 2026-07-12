"use client";

// Premium written by month: gold bars; the trailing-30-day bar renders at
// lower opacity with a value label, exactly like the mockup.

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCurrency, fmtCurrencyCompact } from "@/lib/format";
import type { PremiumMonthView } from "@/lib/views";
import { Panel, PanelHead } from "../ui";
import { niceCeil, TableToggle, TooltipCard } from "./chart-bits";

export function PremiumPanel({ months }: { months: PremiumMonthView[] }) {
  const maxVal = niceCeil(Math.max(1, ...months.map((m) => m.premiumDollars)) * 1.15);
  const yTicks = [0, maxVal / 3, (maxVal * 2) / 3, maxVal];
  const currentIdx = months.findIndex((m) => m.isCurrent);

  return (
    <Panel>
      <PanelHead title="Premium written" sub="By month, last 6 months" />
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 16, right: 10, bottom: 0, left: -6 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} />
            <YAxis
              domain={[0, maxVal]}
              ticks={yTicks}
              tickFormatter={fmtCurrencyCompact}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const m = payload[0]!.payload as PremiumMonthView;
                return (
                  <TooltipCard
                    title={m.isCurrent ? m.label.replace("(Last 30d)", "(last 30 days)") : m.label}
                    rows={[{ key: "var(--gold)", value: fmtCurrency(m.premiumDollars) }]}
                  />
                );
              }}
            />
            <Bar dataKey="premiumDollars" fill="var(--gold)" barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {months.map((m, i) => (
                <Cell key={m.label} fillOpacity={m.isCurrent ? 0.62 : 1} style={{ cursor: "pointer" }} data-idx={i} />
              ))}
              <LabelList
                dataKey="premiumDollars"
                content={(props) => {
                  const { x, y, width, value, index } = props as {
                    x?: number | string;
                    y?: number | string;
                    width?: number | string;
                    value?: number | string;
                    index?: number;
                  };
                  if (index !== currentIdx || x == null || y == null) return null;
                  return (
                    <text
                      className="chart-axis-label"
                      x={Number(x) + Number(width ?? 0) / 2}
                      y={Number(y) - 8}
                      textAnchor="middle"
                      fontWeight={700}
                      fontSize={11}
                      fill="var(--ink)"
                    >
                      {fmtCurrencyCompact(Number(value ?? 0))}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle
        table={
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td>{fmtCurrency(m.premiumDollars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </Panel>
  );
}
