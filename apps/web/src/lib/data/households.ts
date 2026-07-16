import { prisma } from "@anchorline/db";
import type { DateRange } from "@anchorline/metrics";

interface HouseholdSqlRow {
  id: string;
  contact_name: string | null;
  az_lead_id: string;
  az_producer_id: string | null;
  premium_cents: number;
  policies: number;
}

export interface HouseholdRow {
  id: string;
  householdLabel: string;
  producerName: string;
  premiumCents: number;
  policies: number;
}

export async function getHouseholds(agencyId: string, range: DateRange): Promise<HouseholdRow[]> {
  const rows = await prisma.$queryRaw<HouseholdSqlRow[]>`
    SELECT l.id, l.contact_name, l.az_lead_id, ps.az_producer_id,
           SUM(ps.premium_cents)::int AS premium_cents, COUNT(*)::int AS policies
    FROM policies_sold ps JOIN leads l ON l.id = ps.lead_id
    WHERE ps.agency_id = ${agencyId} AND ps.sold_date >= ${range.from} AND ps.sold_date < ${range.to}
    GROUP BY 1, 2, 3, 4
    ORDER BY premium_cents DESC
    LIMIT 200`;

  const producerIds = [...new Set(rows.flatMap((row) => (row.az_producer_id ? [row.az_producer_id] : [])))];
  const producers = producerIds.length
    ? await prisma.producerIdentityMap.findMany({
        where: { agencyId, azProducerId: { in: producerIds } },
        select: { azProducerId: true, displayName: true },
      })
    : [];
  const producerByAzId = new Map(producers.map((producer) => [producer.azProducerId, producer.displayName]));

  return rows.map((row) => ({
    id: row.id,
    householdLabel: row.contact_name ?? `Lead #${row.az_lead_id}`,
    producerName: producerByAzId.get(row.az_producer_id) ?? "Unmapped",
    premiumCents: row.premium_cents,
    policies: row.policies,
  }));
}
