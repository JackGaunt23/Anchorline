"use client";

// Producer drill-down modal: recent scored calls with process scorecards.
// Opened from the producer table, the bubble chart, or the leaderboard.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fmtCurrency, fmtDateShort, fmtDuration, fmtPct } from "@/lib/format";
import type { ProducerRowView, ScoredCallView } from "@/lib/views";
import { Avatar } from "../ui";
import { IconCheck, IconCross } from "../icons";

const PAGE_SIZE = 10;

const ModalContext = createContext<{ openProducer: (id: string) => void }>({ openProducer: () => {} });

export const useProducerModal = () => useContext(ModalContext);

export function ProducerModalProvider({
  producers,
  timezone,
  children,
}: {
  producers: ProducerRowView[];
  timezone: string;
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const lastFocused = useRef<Element | null>(null);

  const openProducer = useCallback((id: string) => {
    lastFocused.current = document.activeElement;
    setOpenId(id);
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
  }, []);

  const producer = producers.find((p) => p.id === openId) ?? null;

  return (
    <ModalContext.Provider value={{ openProducer }}>
      {children}
      {producer && <ProducerModal producer={producer} timezone={timezone} onClose={close} />}
    </ModalContext.Provider>
  );
}

function ProducerModal({ producer, timezone, onClose }: { producer: ProducerRowView; timezone: string; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [calls, setCalls] = useState<ScoredCallView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    closeBtn.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/producers/${producer.id}/scored-calls?page=0&pageSize=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data: { calls: ScoredCallView[]; total: number }) => {
        if (cancelled) return;
        setCalls(data.calls);
        setTotal(data.total);
        setPage(0);
      })
      .catch(() => !cancelled && setCalls([]));
    return () => {
      cancelled = true;
    };
  }, [producer.id]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetch(`/api/producers/${producer.id}/scored-calls?page=${next}&pageSize=${PAGE_SIZE}`);
      const data = (await res.json()) as { calls: ScoredCallView[]; total: number };
      setCalls((c) => [...(c ?? []), ...data.calls]);
      setTotal(data.total);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(8,12,14,0.55)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[86vh] w-[min(720px,100%)] overflow-y-auto rounded-lg border border-hairline bg-card shadow-float"
        role="dialog"
        aria-modal="true"
        aria-labelledby="producer-modal-name"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3.5 border-b border-hairline bg-card px-[22px] py-5">
          <div className="flex items-center gap-3">
            <Avatar initials={producer.initials} size="lg" />
            <div>
              <div id="producer-modal-name" className="font-display text-[17px] font-bold">
                {producer.displayName}
              </div>
              <div className="text-xs text-ink-muted">{producer.roleTitle}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {producer.processScore != null && <Chip>{producer.processScore}% process score</Chip>}
                {producer.closeRatePct != null && <Chip>{fmtPct(producer.closeRatePct)} close rate</Chip>}
                <Chip>{fmtCurrency(producer.premiumDollars)} written</Chip>
              </div>
            </div>
          </div>
          <button
            ref={closeBtn}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-sunken text-ink-secondary hover:bg-page"
          >
            <IconCross size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-[22px] pb-[26px] pt-[18px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">Recent calls</div>
          <div className="flex flex-col gap-3">
            {calls === null && <p className="py-4 text-center text-[12.5px] text-ink-muted">Loading scored calls…</p>}
            {calls?.length === 0 && (
              <p className="py-4 text-center text-[12.5px] text-ink-muted">No scored calls yet for this producer.</p>
            )}
            {calls?.map((c) => (
              <CallCard key={c.callId} call={c} timezone={timezone} />
            ))}
            {calls && calls.length < total && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
                className="cursor-pointer self-center rounded-full border border-hairline-strong bg-sunken px-4 py-[7px] text-[12.5px] font-semibold text-ink hover:bg-page disabled:opacity-75"
              >
                {loadingMore ? "Loading…" : `Load more (${total - calls.length} remaining)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[5px] rounded-full bg-sunken px-[9px] py-1 text-[11.5px] font-semibold text-ink-secondary">
      {children}
    </span>
  );
}

/** Call-score bands from the mockup: ≥75 good, ≥45 mid, else low. */
function scoreBand(score: number): "good" | "mid" | "low" {
  if (score >= 75) return "good";
  if (score >= 45) return "mid";
  return "low";
}

const BAND_CLASSES = {
  good: "text-good bg-good-soft",
  mid: "text-warning bg-warning-soft",
  low: "text-critical bg-critical-soft",
};

const STEP_LABELS: [keyof ScoredCallView["steps"], string][] = [
  ["rapport", "Rapport"],
  ["discovery", "Discovery questions"],
  ["quote", "Quote presented"],
  ["objection", "Objection handling"],
  ["close", "Close attempted"],
];

function CallCard({ call, timezone }: { call: ScoredCallView; timezone: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-hairline px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-px">
          <span className="text-[12.5px] font-bold">{fmtDateShort(call.startTime, timezone)}</span>
          <span className="font-mono text-[11.5px] text-ink-muted">{fmtDuration(call.durationSeconds)} call</span>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 font-mono text-[13px] font-extrabold ${BAND_CLASSES[scoreBand(call.score)]}`}>
          {call.score}/100
        </span>
      </div>
      <p className="text-[12.5px] leading-[1.55] text-ink-secondary">{call.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {STEP_LABELS.map(([key, label]) => {
          const ok = call.steps[key];
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-[5px] rounded-full border border-hairline py-1 pl-1.5 pr-2 text-[11px] font-semibold ${
                ok ? "text-good" : "text-ink-muted"
              }`}
            >
              {ok ? <IconCheck /> : <IconCross />}
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
