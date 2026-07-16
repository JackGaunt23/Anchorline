"use client";

import { useCallback, useState } from "react";
import { fmtDuration } from "@/lib/format";
import { IconCheck } from "../icons";
import { Panel } from "../ui";
import { LogCallModal, type LogCallTarget } from "./log-call-modal";

export interface ConversationView {
  id: string;
  contactLabel: string;
  startTimeIso: string;
  durationSeconds: number;
  lastPriorContactAtIso: string | null;
  producerName: string;
  qualifies: boolean;
  reason: "under_10_min" | "contacted_recently" | null;
  daysSinceContact: number | null;
}

export function ConversationsPanel({
  conversations,
  timezone,
  nowIso,
}: {
  conversations: ConversationView[];
  timezone: string;
  nowIso: string;
}) {
  const [modalTarget, setModalTarget] = useState<LogCallTarget | null>(null);
  const closeModal = useCallback(() => setModalTarget(null), []);
  const qualifying = conversations.filter((call) => call.qualifies);
  const skipped = conversations.filter((call) => !call.qualifies);

  return (
    <Panel aria-labelledby="new-conversations-heading" className="gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="new-conversations-heading" className="font-display text-[19px] font-semibold">
            New conversations
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-secondary">
            Flagged when a call runs{" "}
            <code className="rounded-[5px] bg-sunken px-1.5 py-px font-mono text-[11.5px]">&gt; 10 min</code> with a
            prospect not contacted in the last{" "}
            <code className="rounded-[5px] bg-sunken px-1.5 py-px font-mono text-[11.5px]">30 days</code> (or first
            contact).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalTarget({})}
          className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-full bg-teal px-4 text-[12.5px] font-bold text-white hover:brightness-105"
        >
          <span className="text-base leading-none">＋</span> Log call
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {qualifying.map((call) => (
          <ConversationCard
            key={call.id}
            call={call}
            timezone={timezone}
            nowIso={nowIso}
            onLog={() => setModalTarget({ callId: call.id, contactLabel: call.contactLabel })}
          />
        ))}
        {qualifying.length === 0 && <Empty text="No calls met the new-conversation rule in the last 7 days." />}
      </div>

      <div className="mt-1 border-t border-dashed border-hairline-strong pt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
        Didn&apos;t qualify
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {skipped.map((call) => (
          <ConversationCard key={call.id} call={call} timezone={timezone} nowIso={nowIso} />
        ))}
        {skipped.length === 0 && <Empty text="No non-qualifying calls in the last 7 days." />}
      </div>

      {modalTarget && <LogCallModal target={modalTarget} onClose={closeModal} />}
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="col-span-full rounded-md border border-dashed border-hairline px-4 py-6 text-center text-[12.5px] text-ink-muted">{text}</p>;
}

function ConversationCard({
  call,
  timezone,
  nowIso,
  onLog,
}: {
  call: ConversationView;
  timezone: string;
  nowIso: string;
  onLog?: () => void;
}) {
  const skipLabel =
    call.reason === "under_10_min"
      ? "Under 10 min"
      : call.daysSinceContact === 0
        ? "Contacted today"
        : `Contacted ${call.daysSinceContact ?? 0}d ago`;
  return (
    <div className={`flex min-w-0 flex-col gap-[9px] rounded-md border border-hairline bg-card px-[15px] py-[13px] ${call.qualifies ? "" : "opacity-55"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13.5px] font-bold">{call.contactLabel}</span>
        {call.qualifies ? (
          <span className="inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full bg-teal-soft px-[9px] py-1 text-[10px] font-extrabold uppercase tracking-[0.03em] text-teal">
            <IconCheck /> New conversation
          </span>
        ) : (
          <span className="max-w-[118px] flex-none rounded-full bg-sunken px-[9px] py-1 text-center text-[10px] font-bold uppercase tracking-[0.03em] text-ink-muted">
            {skipLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-[3px] text-[11.5px] text-ink-muted">
        <span className="font-mono text-[13.5px] font-bold text-ink">{fmtDuration(call.durationSeconds)} call</span>
        <span>{lastContactLabel(call, timezone)}</span>
        <span>{relativeCallTime(call.startTimeIso, nowIso, timezone)} · {call.producerName}</span>
      </div>
      {onLog && (
        <button
          type="button"
          onClick={onLog}
          className="mt-0.5 min-h-8 cursor-pointer self-start rounded-full border border-hairline-strong bg-transparent px-3 text-[11.5px] font-bold text-teal hover:bg-teal-soft"
        >
          Log call
        </button>
      )}
    </div>
  );
}

function dateKey(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function relativeCallTime(startIso: string, nowIso: string, timezone: string) {
  const start = new Date(startIso);
  const now = new Date(nowIso);
  const today = dateKey(now, timezone);
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000), timezone);
  const callDay = dateKey(start, timezone);
  const dayLabel = callDay === today ? "Today" : callDay === yesterday ? "Yesterday" : start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return `${dayLabel}, ${time}`;
}

function lastContactLabel(call: ConversationView, timezone: string) {
  if (!call.lastPriorContactAtIso) return "First contact — no prior call on file";
  const date = new Date(call.lastPriorContactAtIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  });
  return `Last contact ${call.daysSinceContact} days ago (${date})`;
}
