// Authenticated app shell: sidebar + topbar + POC banner around every page.
// Auth is enforced by the middleware; this layout just reads the session.

import { Suspense } from "react";
import { auth } from "@/auth";
import { getAgency } from "@/lib/data/agency";
import { fmtToday } from "@/lib/format";
import { isDemoMode, getCallProvider, getCrmProvider } from "@anchorline/providers";
import { Sidebar, type SidebarIntegration } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { ToastProvider } from "@/components/toast";
import { IconWarn } from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, agency, rcStatus, azStatus] = await Promise.all([
    auth(),
    getAgency(),
    getCallProvider().checkConnection(),
    getCrmProvider().checkConnection(),
  ]);
  const demo = isDemoMode();

  const integrations: SidebarIntegration[] = [
    { source: "ringcentral", name: "RingCentral", badge: "RC", detail: rcStatus.detail, connected: rcStatus.connected },
    { source: "agencyzoom", name: "AgencyZoom", badge: "AZ", detail: azStatus.detail, connected: azStatus.connected },
  ];

  return (
    <ToastProvider>
      <div className="grid min-h-screen grid-cols-1 min-[981px]:grid-cols-[248px_1fr]">
        <Sidebar integrations={integrations} />
        <div className="flex min-w-0 flex-col">
          <Suspense>
            <Topbar
              todayLabel={fmtToday(new Date(), agency.timezone)}
              demo={demo}
              userName={session?.user?.name ?? "Owner"}
              userEmail={session?.user?.email ?? ""}
            />
          </Suspense>
          {demo && (
            <div
              className="flex items-center justify-center gap-2.5 border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-warning-soft px-7 py-[9px] text-center text-[12.5px] font-semibold text-warning"
              role="note"
            >
              <IconWarn />
              Proof of concept only. No live systems are connected yet.
            </div>
          )}
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
