"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { RANGE_PRESETS, DEFAULT_RANGE_DAYS } from "@/lib/range";
import { initials } from "@/lib/format";
import { IconCalendar, IconInfo } from "../icons";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/calls": "Calls",
  "/quotes-policies": "Quotes & Policies",
  "/producers": "Producers",
  "/reports": "Reports",
  "/settings": "Settings",
};

export function Topbar({ todayLabel, demo, userName, userEmail }: {
  todayLabel: string;
  demo: boolean;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "Anchorline";

  return (
    <header className="sticky top-0 z-[5] flex items-center justify-between gap-4 border-b border-hairline bg-[color-mix(in_srgb,var(--surface-page)_88%,transparent)] px-7 py-4 backdrop-blur-[8px]">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-2xl font-medium [text-wrap:balance]">{title}</h1>
        <p className="text-[12.5px] text-ink-muted">{todayLabel}</p>
      </div>
      <div className="flex items-center gap-3">
        {demo && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-[color-mix(in_srgb,var(--warning)_55%,transparent)] bg-warning-soft py-[5px] pl-2 pr-2.5 text-[11px] font-bold tracking-[0.03em] text-warning">
            <IconInfo />
            Demo Mode - Sample Data Only
          </span>
        )}
        {pathname === "/" && <RangeSelector />}
        <UserMenu userName={userName} userEmail={userEmail} />
      </div>
    </header>
  );
}

/** Date-range preset selector; writes ?days=N to the URL (day-aligned ranges). */
function RangeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const days = Number(searchParams.get("days")) || DEFAULT_RANGE_DAYS;
  const current = RANGE_PRESETS.find((p) => p.days === days) ?? RANGE_PRESETS[2];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline-strong bg-card px-3 py-[7px] text-[12.5px] font-semibold text-ink-secondary hover:bg-sunken"
      >
        <IconCalendar />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 w-40 rounded-md border border-hairline bg-card p-1 shadow-float" role="listbox">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              role="option"
              aria-selected={p.days === current.days}
              onClick={() => {
                setOpen(false);
                const params = new URLSearchParams(searchParams);
                params.set("days", String(p.days));
                router.replace(`/?${params.toString()}`);
              }}
              className={`block w-full cursor-pointer rounded-sm px-2.5 py-[7px] text-left text-[12.5px] ${
                p.days === current.days ? "bg-teal-soft font-semibold text-teal" : "text-ink-secondary hover:bg-sunken"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full bg-teal-soft text-xs font-bold text-teal"
      >
        {initials(userName)}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 w-56 rounded-md border border-hairline bg-card p-1 shadow-float" role="menu">
          <div className="border-b border-hairline px-2.5 py-2">
            <div className="text-[12.5px] font-semibold">{userName}</div>
            <div className="text-[11.5px] text-ink-muted">{userEmail}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-1 block w-full cursor-pointer rounded-sm px-2.5 py-[7px] text-left text-[12.5px] text-ink-secondary hover:bg-sunken hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
