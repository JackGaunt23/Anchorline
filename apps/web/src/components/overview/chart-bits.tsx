"use client";

// Shared chart plumbing: tooltip chrome, axis math, table toggles.

import { useState } from "react";

/** Round up to a "nice" axis maximum (1/2/5 × 10^n), as in the mockup. */
export function niceCeil(v: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(v || 1)));
  const norm = v / mag;
  const n = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return n * mag;
}

export function TooltipCard({ title, rows }: { title: string; rows: { key?: string; name?: string; value: string }[] }) {
  return (
    <div className="chart-tooltip">
      <div className="tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div className="tooltip-row" key={i}>
          {r.key && <span className="tooltip-key" style={{ background: r.key }} />}
          {r.name && <span className="tooltip-name">{r.name}&nbsp;</span>}
          <span className="tooltip-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** "View as table" accessibility toggle under each chart. */
export function TableToggle({ table }: { table: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start cursor-pointer border-none bg-transparent p-0 py-0.5 text-xs font-semibold text-teal underline underline-offset-2"
      >
        {open ? "Hide table" : "View as table"}
      </button>
      {open && <div className="overflow-x-auto">{table}</div>}
    </>
  );
}
