"use client";

// AI daily summary panel with three insight cards and a Regenerate action.
// Demo mode rotates deterministic variants; live generation lands in Phase 5.

import { useState } from "react";
import { fmtTime } from "@/lib/format";
import type { SummaryView } from "@/lib/views";
import { Panel } from "../ui";
import { useToast } from "../toast";
import { IconRefresh, IconSparkle, IconSpinner } from "../icons";

const DOT_CLASSES = { good: "bg-good", warning: "bg-warning", info: "bg-slate" };

export function AiSummaryPanel({ initial, demo, timezone }: { initial: SummaryView | null; demo: boolean; timezone: string }) {
  const [summary, setSummary] = useState(initial);
  const [justNow, setJustNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch("/api/summary/regenerate", { method: "POST" });
      const data = (await res.json()) as {
        summary?: { summaryText: string; insights: SummaryView["insights"]; generatedAt: string; model: string };
        error?: string;
      };
      if (!res.ok || !data.summary) throw new Error(data.error ?? "Could not regenerate summary");
      setSummary({
        summaryText: data.summary.summaryText,
        insights: data.summary.insights,
        generatedAtIso: data.summary.generatedAt,
        model: data.summary.model,
      });
      setJustNow(true);
    } catch (err) {
      showToast("Regenerate failed", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const meta = summary
    ? justNow
      ? `Generated just now · ${demo ? "based on sample data" : summary.model}`
      : `Generated ${fmtTime(summary.generatedAtIso, timezone)} · ${demo ? "based on sample data" : summary.model}`
    : null;

  return (
    <Panel aria-labelledby="ai-heading">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-teal-soft text-teal">
            <IconSparkle />
          </span>
          <div>
            <h3 id="ai-heading" className="text-[15px] font-bold">
              AI daily summary
            </h3>
            {meta && <p className="text-[11.5px] text-ink-muted">{meta}</p>}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={regenerate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline-strong bg-sunken px-3 py-[7px] text-[12.5px] font-semibold text-ink hover:bg-page disabled:opacity-75"
        >
          {busy ? <IconSpinner size={13} /> : <IconRefresh size={13} />}
          Regenerate
        </button>
      </div>

      {summary ? (
        <>
          <p className="max-w-[78ch] text-[14.5px] leading-[1.65] text-ink [text-wrap:balance]">{summary.summaryText}</p>
          <div className="mt-1 grid grid-cols-1 gap-2.5 min-[821px]:grid-cols-3">
            {summary.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-[9px] rounded-md border border-hairline bg-sunken px-3 py-[11px]">
                <span className={`mt-[5px] h-2 w-2 flex-none rounded-full ${DOT_CLASSES[insight.tone] ?? DOT_CLASSES.info}`} />
                <InsightText producer={insight.producer} text={insight.text} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="py-3 text-[12.5px] text-ink-muted">
          No daily summary generated yet — press Regenerate to create one.
        </p>
      )}
    </Panel>
  );
}

/** Bold the producer's name inside the insight text (as the mockup does). */
function InsightText({ producer, text }: { producer: string; text: string }) {
  const idx = text.indexOf(producer);
  if (idx === -1) return <div className="text-[12.5px] text-ink-secondary">{text}</div>;
  return (
    <div className="text-[12.5px] text-ink-secondary">
      {text.slice(0, idx)}
      <strong className="text-ink">{producer}</strong>
      {text.slice(idx + producer.length)}
    </div>
  );
}
