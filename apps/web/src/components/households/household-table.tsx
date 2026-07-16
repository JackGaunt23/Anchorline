import type { HouseholdRow } from "@/lib/data/households";
import { fmtCurrency, fmtInt, initials } from "@/lib/format";
import { Avatar } from "../ui";

export function HouseholdTable({ rows }: { rows: HouseholdRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline px-4 py-8 text-center text-[12.5px] text-ink-muted">
        No households with policies sold in this period.
      </p>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-hairline-strong text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
              <th className="px-3 pb-2.5 pt-2 text-left">Household</th>
              <th className="px-3 pb-2.5 pt-2 text-left">Producer</th>
              <th className="px-3 pb-2.5 pt-2 text-right">Premium written</th>
              <th className="px-3 pb-2.5 pt-2 text-right">Policies sold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-3 text-[13px] font-semibold">{row.householdLabel}</td>
                <td className="px-3 py-3">
                  <ProducerCell name={row.producerName} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-[13px]">{fmtCurrency(row.premiumCents / 100)}</td>
                <td className="px-3 py-3 text-right font-mono text-[13px]">{fmtInt(row.policies)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2.5 sm:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-hairline px-3.5 py-2.5">
            <MobileRow label="Household"><span className="font-semibold text-ink">{row.householdLabel}</span></MobileRow>
            <MobileRow label="Producer"><ProducerCell name={row.producerName} /></MobileRow>
            <MobileRow label="Premium written"><span className="font-mono">{fmtCurrency(row.premiumCents / 100)}</span></MobileRow>
            <MobileRow label="Policies sold" last><span className="font-mono">{fmtInt(row.policies)}</span></MobileRow>
          </div>
        ))}
      </div>
    </>
  );
}

function ProducerCell({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar initials={initials(name)} />
      <span className="text-[13px] font-semibold">{name}</span>
    </span>
  );
}

function MobileRow({ label, last = false, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-right text-[13px] ${last ? "" : "border-b border-dashed border-hairline"}`}>
      <span className="text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">{label}</span>
      {children}
    </div>
  );
}
