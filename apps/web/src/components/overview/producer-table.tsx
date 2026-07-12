"use client";

// Producer performance table — the page's centerpiece. Rows open the
// drill-down modal (click, Enter, or Space).

import { fmtCurrency, fmtInt, fmtMinutes, fmtPct } from "@/lib/format";
import type { ProducerRowView } from "@/lib/views";
import { Avatar, SignalPill } from "../ui";
import { IconChevronRight, IconRingUp } from "../icons";
import { useProducerModal } from "./producer-modal";

/** Score color bands from the mockup: ≥80 good, ≥55 gold, else critical. */
function scoreColor(score: number) {
  if (score >= 80) return "var(--good)";
  if (score >= 55) return "var(--gold)";
  return "var(--critical)";
}

export function ProducerTable({ rows }: { rows: ProducerRowView[] }) {
  const { openProducer } = useProducerModal();

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-card p-5 pb-[18px] shadow-card" aria-labelledby="producer-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="producer-heading" className="font-display text-[19px] font-semibold">
          Producer performance
        </h2>
        <p className="text-[12.5px] text-ink-muted">Click a row to see recent calls and process scorecards</p>
      </div>
      <div className="overflow-x-auto">
        <table className="producer-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Producer</th>
              <th>Calls</th>
              <th>Talk time</th>
              <th>Sales process score</th>
              <th>Quotes</th>
              <th>Policies sold</th>
              <th>Premium written</th>
              <th>Close rate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="!text-center text-ink-muted">
                  No producers mapped yet — add mappings in Settings.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                onClick={() => openProducer(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openProducer(p.id);
                  }
                }}
                className="group cursor-pointer transition-colors duration-100 hover:bg-sunken focus-visible:bg-teal-soft"
              >
                <td>
                  <SignalPill label={p.badgeLabel} tone={p.badgeTone} icon={p.badgeTone === "ramping" ? <IconRingUp /> : undefined} />
                </td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={p.initials} />
                    <div>
                      <div className="text-[13px] font-semibold">{p.displayName}</div>
                      <div className="text-[11.5px] text-ink-muted">{p.roleTitle}</div>
                    </div>
                  </div>
                </td>
                <td>{fmtInt(p.calls)}</td>
                <td>{fmtMinutes(p.talkMinutes)}</td>
                <td>
                  {p.processScore != null ? (
                    <span className="inline-flex items-center justify-end gap-2">
                      {p.processScore}%
                      <span className="h-[5px] w-[46px] overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${p.processScore}%`, background: scoreColor(p.processScore) }}
                        />
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td>{fmtInt(p.quotes)}</td>
                <td>{fmtInt(p.policies)}</td>
                <td>{fmtCurrency(p.premiumDollars)}</td>
                <td>{p.closeRatePct != null ? fmtPct(p.closeRatePct) : "—"}</td>
                <td>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal">
                    View calls
                    <span className="transition-transform duration-100 group-hover:translate-x-0.5">
                      <IconChevronRight />
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
