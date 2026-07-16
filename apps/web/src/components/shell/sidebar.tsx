"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { pulseKpis } from "../pulse";
import { useToast } from "../toast";
import {
  IconDoc,
  IconNavCalls,
  IconNavHouse,
  IconNavOverview,
  IconNavPerson,
  IconNavReports,
  IconNavSettings,
  IconRefresh,
  IconSpinner,
} from "../icons";

const NAV = [
  { href: "/", label: "Overview", Icon: IconNavOverview },
  { href: "/calls", label: "Calls", Icon: IconNavCalls },
  { href: "/households", label: "Households", Icon: IconNavHouse },
  { href: "/quotes-policies", label: "Quotes & Policies", Icon: IconDoc },
  { href: "/producers", label: "Producers", Icon: IconNavPerson },
  { href: "/reports", label: "Reports", Icon: IconNavReports },
  { href: "/settings", label: "Settings", Icon: IconNavSettings },
];

export interface SidebarIntegration {
  source: "ringcentral" | "agencyzoom";
  name: string;
  badge: string;
  detail: string;
  connected: boolean;
}

export function Sidebar({ integrations }: { integrations: SidebarIntegration[] }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen flex-col gap-7 border-r border-hairline bg-card px-[18px] py-[22px] min-[981px]:flex">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="font-display text-[22px] tracking-[0.2px]">Anchorline</span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Brokerage Ops</span>
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {NAV.map(({ href, label, Icon }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-sm border border-transparent px-2.5 py-[9px] text-[13.5px] ${
                current
                  ? "bg-teal-soft font-semibold text-teal"
                  : "text-ink-secondary hover:bg-sunken hover:text-ink"
              }`}
            >
              <span className={current ? "" : "opacity-80"}>
                <Icon />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5">
        <div className="px-0.5 pb-0.5 text-[11px] uppercase tracking-[0.08em] text-ink-muted">Integrations</div>
        {integrations.map((integration) => (
          <SyncCard key={integration.source} integration={integration} />
        ))}
      </div>
    </aside>
  );
}

function SyncCard({ integration }: { integration: SidebarIntegration }) {
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function runSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sync/${integration.source}`, { method: "POST" });
      const result = (await res.json()) as { title?: string; body?: string; pulse?: string[]; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Sync failed");
      router.refresh();
      showToast(result.title ?? "Sync complete", result.body ?? "");
      // Give the refresh a beat to paint before pulsing the updated tiles.
      setTimeout(() => pulseKpis(result.pulse ?? []), 350);
    } catch (err) {
      showToast("Sync failed", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-sunken p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-[11px] font-bold tracking-[0.02em] text-card ${
            integration.source === "ringcentral" ? "bg-slate" : "bg-gold"
          }`}
        >
          {integration.badge}
        </span>
        <div>
          <div className="text-[12.5px] font-semibold">{integration.name}</div>
          <div className="flex items-center gap-[5px] text-[11px] text-ink-muted">
            <span
              className={`h-1.5 w-1.5 flex-none rounded-full ${
                syncing ? "bg-warning" : integration.connected ? "bg-good" : "bg-critical"
              }`}
            />
            {integration.detail}
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={syncing}
        onClick={runSync}
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-hairline-strong bg-card px-2.5 py-[7px] text-[12.5px] font-semibold text-ink transition hover:bg-sunken active:translate-y-px disabled:cursor-default disabled:opacity-75"
      >
        {syncing ? (
          <>
            <IconSpinner /> Syncing…
          </>
        ) : (
          <>
            <IconRefresh /> Sync with {integration.name}
          </>
        )}
      </button>
    </div>
  );
}
