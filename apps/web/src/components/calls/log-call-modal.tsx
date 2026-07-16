"use client";

import { useEffect, useRef, useState } from "react";
import { IconCross } from "../icons";
import { useToast } from "../toast";

export interface LogCallTarget {
  callId?: string;
  contactLabel?: string;
}

export function LogCallModal({ target, onClose }: { target: LogCallTarget; onClose: () => void }) {
  const readonlyContact = Boolean(target.callId);
  const [contactLabel, setContactLabel] = useState(target.contactLabel ?? "");
  const [disposition, setDisposition] = useState("quoted");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<Element | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    lastFocused.current = document.activeElement;
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    };
  }, [onClose]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/call-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactLabel,
          disposition,
          ...(notes.trim() && { notes: notes.trim() }),
          ...(target.callId && { callId: target.callId }),
        }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Could not save call outcome");
      showToast("Call logged", `Outcome saved for ${contactLabel.trim()}.`);
      onClose();
    } catch (error) {
      showToast("Log call failed", error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(8,12,14,0.55)] p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[86vh] w-[min(560px,100%)] overflow-y-auto rounded-lg border border-hairline bg-card shadow-float"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-call-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-[22px] py-5">
          <h2 id="log-call-title" className="font-display text-[18px] font-bold">
            Log call outcome
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-sunken text-ink-secondary hover:bg-page"
          >
            <IconCross size={15} />
          </button>
        </div>

        <form className="flex flex-col gap-4 px-[22px] pb-[26px] pt-5" onSubmit={save}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Contact</span>
            <input
              required
              readOnly={readonlyContact}
              value={contactLabel}
              onChange={(event) => setContactLabel(event.target.value)}
              className="w-full rounded-sm border border-hairline-strong bg-card px-3 py-2.5 text-[13.5px] text-ink read-only:bg-sunken read-only:text-ink-secondary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Disposition</span>
            <select
              value={disposition}
              onChange={(event) => setDisposition(event.target.value)}
              className="w-full rounded-sm border border-hairline-strong bg-card px-3 py-2.5 text-[13.5px] text-ink"
            >
              <option value="quoted">Quoted</option>
              <option value="follow_up_needed">Follow-up needed</option>
              <option value="not_interested">Not interested</option>
              <option value="sale_closed">Sale closed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-[92px] w-full resize-y rounded-sm border border-hairline-strong bg-card px-3 py-2.5 text-[13.5px] leading-6 text-ink"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 cursor-pointer rounded-full border border-hairline-strong bg-sunken px-5 text-[13px] font-bold text-ink hover:bg-page"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !contactLabel.trim()}
              className="min-h-10 cursor-pointer rounded-full bg-teal px-5 text-[13px] font-bold text-white hover:brightness-105 disabled:cursor-default disabled:opacity-65"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
