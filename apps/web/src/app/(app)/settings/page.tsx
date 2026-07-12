// Settings: integration status, producer identity mapping (RC extension ↔
// AZ producer), unmapped buckets, and the sync run log.

import { getAgency } from "@/lib/data/agency";
import { getIntegrations, getSyncLog, getUnmapped, listIdentityMap } from "@/lib/data/settings";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { Panel, PanelHead } from "@/components/ui";
import { IdentityMapEditor, type MappingView } from "@/components/settings/identity-map-editor";

export default async function SettingsPage() {
  const agency = await getAgency();
  const [{ mode, integrations }, mappings, unmapped, syncLog] = await Promise.all([
    getIntegrations(agency.id),
    listIdentityMap(agency.id),
    getUnmapped(agency.id),
    getSyncLog(agency.id),
  ]);

  const mappingViews: MappingView[] = mappings.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    roleTitle: m.roleTitle,
    rcExtensionId: m.rcExtensionId,
    azProducerId: m.azProducerId,
    isRamping: m.isRamping,
    active: m.active,
  }));

  return (
    <main className="flex max-w-[980px] flex-col gap-[22px] px-7 pb-12 pt-[22px]">
      {/* Integrations */}
      <Panel>
        <PanelHead title="Integrations" sub={`Data mode: ${mode}. Providers are selected by the DATA_MODE environment variable.`} />
        <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
          {integrations.map((integration) => (
            <div key={integration.source} className="flex flex-col gap-2 rounded-md border border-hairline bg-sunken p-3.5">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-[11px] font-bold text-card ${
                    integration.source === "ringcentral" ? "bg-slate" : "bg-gold"
                  }`}
                >
                  {integration.source === "ringcentral" ? "RC" : "AZ"}
                </span>
                <div className="text-[13px] font-semibold">{integration.name}</div>
                <span
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    integration.status.connected ? "bg-good-soft text-good" : "bg-critical-soft text-critical"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${integration.status.connected ? "bg-good" : "bg-critical"}`} />
                  {integration.status.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="text-xs text-ink-secondary">{integration.status.detail}</div>
              <div className="text-[11.5px] text-ink-muted">
                {integration.lastSuccess
                  ? `Last successful sync ${fmtDateTime(integration.lastSuccess.startedAt, agency.timezone)} · ${fmtInt(integration.lastSuccess.recordsUpserted)} records`
                  : "No successful sync yet"}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Identity map */}
      <Panel>
        <PanelHead
          title="Producer identity map"
          sub="Joins RingCentral extensions to AgencyZoom producers. Unmapped activity stays in the buckets below until mapped."
        />
        <IdentityMapEditor mappings={mappingViews} />
      </Panel>

      {/* Unmapped buckets */}
      <Panel>
        <PanelHead
          title="Unmapped activity"
          sub="Synced records whose RingCentral extension or AgencyZoom producer has no mapping. They are excluded from producer metrics until mapped."
        />
        <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">RingCentral extensions</div>
            {unmapped.extensions.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">All call extensions are mapped.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Extension</th>
                    <th>Calls</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.extensions.map((e) => (
                    <tr key={e.rcExtensionId}>
                      <td>{e.rcExtensionId}</td>
                      <td>{fmtInt(e.calls)}</td>
                      <td>{fmtDateTime(e.lastSeen, agency.timezone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">AgencyZoom producers</div>
            {unmapped.azProducers.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">All AgencyZoom producers are mapped.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producer ID</th>
                    <th>Leads</th>
                    <th>Quotes</th>
                    <th>Policies</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.azProducers.map((p) => (
                    <tr key={p.azProducerId}>
                      <td>{p.azProducerId}</td>
                      <td>{fmtInt(p.leads)}</td>
                      <td>{fmtInt(p.quotes)}</td>
                      <td>{fmtInt(p.policies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Panel>

      {/* Sync log */}
      <Panel>
        <PanelHead title="Sync log" sub="Most recent sync runs across both sources." />
        {syncLog.length === 0 ? (
          <p className="text-[12.5px] text-ink-muted">No sync runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Records</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {syncLog.map((run) => (
                  <tr key={run.id}>
                    <td className="!font-sans">{run.source === "ringcentral" ? "RingCentral" : "AgencyZoom"}</td>
                    <td className="!font-sans">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          run.status === "success"
                            ? "bg-good-soft text-good"
                            : run.status === "failed"
                              ? "bg-critical-soft text-critical"
                              : "bg-warning-soft text-warning"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>{fmtDateTime(run.startedAt, agency.timezone)}</td>
                    <td>{run.finishedAt ? fmtDateTime(run.finishedAt, agency.timezone) : "—"}</td>
                    <td>{fmtInt(run.recordsUpserted)}</td>
                    <td className="!font-sans !text-left text-ink-muted">{run.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
