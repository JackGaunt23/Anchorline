import { HouseholdTable } from "@/components/households/household-table";
import { Panel } from "@/components/ui";
import { getAgency } from "@/lib/data/agency";
import { getHouseholds } from "@/lib/data/households";
import { resolveRange } from "@/lib/range";

export default async function HouseholdsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const { range } = resolveRange(params);
  const agency = await getAgency();
  const households = await getHouseholds(agency.id, range);

  return (
    <main className="flex max-w-[1360px] flex-col gap-[22px] px-7 pb-12 pt-[22px]">
      <Panel aria-labelledby="household-view-heading" className="p-5 pb-[18px]">
        <div>
          <h2 id="household-view-heading" className="font-display text-[19px] font-semibold">
            Household view
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Households with policies sold in the selected period · rolls up into each producer&apos;s totals shown in Producer performance.
          </p>
        </div>
        <HouseholdTable rows={households} />
      </Panel>
    </main>
  );
}
