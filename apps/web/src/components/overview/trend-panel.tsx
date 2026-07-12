"use client";

// Calls & quotes daily trend: calls as a soft teal area, quotes as a slate
// line, crosshair tooltip, and an accessible table alternative.

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDayKey, fmtDayKeyLong, fmtInt } from "@/lib/format";
import type { TrendDayView } from "@/lib/views";
import { Panel, PanelHead } from "../ui";
import { niceCeil, TableToggle, TooltipCard } from "./chart-bits";

export function TrendPanel({ days }: { days: TrendDayView[] }) {
  const n = days.length;
  const last = days[n - 1];
  const maxVal = niceCeil(Math.max(1, ...days.map((d) => d.calls)) * 1.15);
  const yTicks = [0, maxVal / 3, (maxVal * 2) / 3, maxVal];
  const xTicks = days.filter((_, i) => i % 3 === 0 || i === n - 1).map((d) => d.day);

  const endDot =
    (color: string, dataKey: "calls" | "quotes") =>
    (props: { cx?: number; cy?: number; index?: number }) => {
      if (props.index !== n - 1 || props.cx == null || props.cy == null) return <g key={`${dataKey}-${props.index}`} />;
      return (
        <circle
          key={`${dataKey}-end`}
          cx={props.cx}
          cy={props.cy}
          r={4}
          fill={color}
          stroke="var(--surface-card)"
          strokeWidth={2}
        />
      );
    };

  return (
    <Panel>
      <PanelHead title="Calls & quotes" sub="Daily volume, last 14 days" />
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 16, right: 14, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="day"
              ticks={xTicks}
              tickFormatter={fmtDayKey}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, maxVal]} ticks={yTicks} tickFormatter={fmtInt} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              cursor={{ stroke: "var(--hairline-strong)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = days.find((x) => x.day === label);
                if (!d) return null;
                return (
                  <TooltipCard
                    title={fmtDayKeyLong(d.day)}
                    rows={[
                      { key: "var(--teal)", name: "Calls", value: fmtInt(d.calls) },
                      { key: "var(--slate)", name: "Quotes", value: fmtInt(d.quotes) },
                    ]}
                  />
                );
              }}
            />
            <Area
              type="linear"
              dataKey="calls"
              stroke="var(--teal)"
              strokeWidth={2}
              fill="var(--teal)"
              fillOpacity={0.12}
              dot={endDot("var(--teal)", "calls")}
              activeDot={{ r: 4.5, stroke: "var(--surface-card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="quotes"
              stroke="var(--slate)"
              strokeWidth={2}
              dot={endDot("var(--slate)", "quotes")}
              activeDot={{ r: 4.5, stroke: "var(--surface-card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-4">
        <span className="flex items-center gap-[7px] text-xs text-ink-secondary">
          <span className="h-0.5 w-3.5 flex-none rounded-[2px] bg-teal" />
          Calls <span className="font-mono font-bold text-ink">{last ? fmtInt(last.calls) : "—"}</span>
        </span>
        <span className="flex items-center gap-[7px] text-xs text-ink-secondary">
          <span className="h-0.5 w-3.5 flex-none rounded-[2px] bg-slate" />
          Quotes <span className="font-mono font-bold text-ink">{last ? fmtInt(last.quotes) : "—"}</span>
        </span>
      </div>
      <TableToggle
        table={
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Calls</th>
                <th>Quotes</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}>
                  <td>{fmtDayKey(d.day)}</td>
                  <td>{fmtInt(d.calls)}</td>
                  <td>{fmtInt(d.quotes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </Panel>
  );
}
