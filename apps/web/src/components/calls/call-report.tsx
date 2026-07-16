import { fmtInt, fmtPct } from "@/lib/format";
import { Panel, PanelHead } from "../ui";

interface CallReportData {
  inbound: number;
  outboundConnected: number;
  outboundVoicemail: number;
  outboundNoAnswer: number;
  outboundTotal: number;
  total: number;
  connectRatePct: number;
}

export function CallReport({ report, subtitle }: { report: CallReportData; subtitle: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const connectedDash = circumference * (report.connectRatePct / 100);
  const maxVolume = Math.max(1, report.inbound, report.outboundTotal);
  const segments = [
    { label: "Inbound", count: report.inbound },
    { label: "Outbound — connected", count: report.outboundConnected },
    { label: "Outbound — voicemail", count: report.outboundVoicemail },
    { label: "Outbound — no answer", count: report.outboundNoAnswer },
    { label: "Total calls", count: report.total },
  ];

  return (
    <Panel aria-labelledby="daily-call-report-heading">
      <div id="daily-call-report-heading">
        <PanelHead title="Daily call report" sub={subtitle} />
      </div>
      <div className="grid grid-cols-1 gap-4 min-[781px]:grid-cols-2">
        <div>
          <p className="mb-2.5 text-xs text-ink-muted">Outbound connect rate</p>
          <div className="flex flex-wrap items-center gap-[18px]">
            <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={`Outbound connect rate ${fmtPct(report.connectRatePct)}`}>
              <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="20" />
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke="var(--good)"
                strokeWidth="20"
                strokeDasharray={`${connectedDash} ${circumference - connectedDash}`}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
              />
              <text x="80" y="78" textAnchor="middle" className="fill-ink font-mono text-[20px] font-extrabold">
                {fmtPct(report.connectRatePct, report.connectRatePct % 1 === 0 ? 0 : 1)}
              </text>
              <text x="80" y="94" textAnchor="middle" className="fill-ink-muted text-[9px] uppercase tracking-[0.04em]">
                connected
              </text>
            </svg>
            <div className="flex min-w-0 flex-col gap-2 text-[12.5px] text-ink-secondary">
              <Legend color="bg-good" label={`Connected ${fmtInt(report.outboundConnected)}`} />
              <Legend color="bg-slate" label={`Voicemail / no answer ${fmtInt(report.outboundVoicemail + report.outboundNoAnswer)}`} />
              <span className="text-ink-muted">Out of {fmtInt(report.outboundTotal)} outbound calls</span>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-ink-muted">Inbound vs. outbound</p>
          <div className="flex flex-col gap-4 px-0.5 pb-0.5 pt-1.5">
            <VolumeBar label="Inbound" value={report.inbound} width={(report.inbound / maxVolume) * 100} color="bg-slate" />
            <VolumeBar label="Outbound" value={report.outboundTotal} width={(report.outboundTotal / maxVolume) * 100} color="bg-teal" />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-hairline-strong text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
              <th className="px-3 pb-2.5 pt-2 text-left">Segment</th>
              <th className="px-3 pb-2.5 pt-2 text-right">Count</th>
              <th className="px-3 pb-2.5 pt-2 text-right">% of total</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.label} className="border-b border-hairline last:border-0">
                <td className="px-3 py-3 text-[13px]">{segment.label}</td>
                <td className="px-3 py-3 text-right font-mono text-[13px]">{fmtInt(segment.count)}</td>
                <td className="px-3 py-3 text-right font-mono text-[13px]">
                  {fmtPct(report.total ? (segment.count / report.total) * 100 : 0, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function VolumeBar({ label, value, width, color }: { label: string; value: number; width: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[60px] flex-none text-[12.5px] font-semibold text-ink-secondary">{label}</span>
      <span className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </span>
      <span className="w-9 flex-none text-right font-mono text-[13px] font-bold">{fmtInt(value)}</span>
    </div>
  );
}
