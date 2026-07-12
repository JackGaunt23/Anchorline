"use client";

// Leaderboard ranked by premium written; top three get medals.

import { fmtCurrency, fmtInt, fmtPct } from "@/lib/format";
import type { ProducerRowView } from "@/lib/views";
import { Avatar, Panel, PanelHead } from "../ui";
import { useProducerModal } from "./producer-modal";

export function Leaderboard({ rows }: { rows: ProducerRowView[] }) {
  const { openProducer } = useProducerModal();

  return (
    <Panel>
      <PanelHead title="Leaderboard" sub="Ranked by premium written" />
      <div className="flex flex-col gap-1">
        {rows.map((p, i) => {
          const rank = i + 1;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => openProducer(p.id)}
              className="grid cursor-pointer grid-cols-[28px_32px_1fr_auto] items-center gap-2.5 rounded-sm px-1.5 py-[9px] text-left hover:bg-sunken"
            >
              {rank <= 3 ? (
                <span className={`medal g${rank}`}>{rank}</span>
              ) : (
                <span className="text-center font-mono text-[13px] font-bold text-ink-muted">{rank}</span>
              )}
              <Avatar initials={p.initials} />
              <div>
                <div className="text-[13px] font-semibold">{p.displayName}</div>
                <div className="text-[11.5px] text-ink-muted">
                  {fmtInt(p.policies)} policies{p.processScore != null ? ` · ${p.processScore}% process score` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[13px] font-bold">{fmtCurrency(p.premiumDollars)}</div>
                <div className="text-[11.5px] text-ink-muted">{p.closeRatePct != null ? `${fmtPct(p.closeRatePct)} close` : "—"}</div>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className="py-4 text-center text-[12.5px] text-ink-muted">No producers in range.</p>}
      </div>
    </Panel>
  );
}
