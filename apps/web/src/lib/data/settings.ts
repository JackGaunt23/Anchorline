// Settings page data: integration status, sync history, identity mapping,
// and the "unmapped" buckets (RC extensions / AZ producers seen in synced
// data but absent from producer_identity_map).

import { prisma, type SyncRun } from "@anchorline/db";
import { getCallProvider, getCrmProvider, getDataMode, type ProviderStatus } from "@anchorline/providers";

export interface IntegrationInfo {
  source: "ringcentral" | "agencyzoom";
  name: string;
  status: ProviderStatus;
  lastSuccess: SyncRun | null;
  lastRun: SyncRun | null;
}

export async function getIntegrations(agencyId: string): Promise<{ mode: string; integrations: IntegrationInfo[] }> {
  const [rcStatus, azStatus, runs] = await Promise.all([
    getCallProvider().checkConnection(),
    getCrmProvider().checkConnection(),
    prisma.syncRun.findMany({ where: { agencyId }, orderBy: { startedAt: "desc" }, take: 50 }),
  ]);

  const lastFor = (source: string, onlySuccess: boolean) =>
    runs.find((r) => r.source === source && (!onlySuccess || r.status === "success")) ?? null;

  return {
    mode: getDataMode(),
    integrations: [
      {
        source: "ringcentral",
        name: "RingCentral",
        status: rcStatus,
        lastSuccess: lastFor("ringcentral", true),
        lastRun: lastFor("ringcentral", false),
      },
      {
        source: "agencyzoom",
        name: "AgencyZoom",
        status: azStatus,
        lastSuccess: lastFor("agencyzoom", true),
        lastRun: lastFor("agencyzoom", false),
      },
    ],
  };
}

export async function getSyncLog(agencyId: string, take = 20): Promise<SyncRun[]> {
  return prisma.syncRun.findMany({ where: { agencyId }, orderBy: { startedAt: "desc" }, take });
}

// ---------------------------------------------------------------------------
// Unmapped buckets
// ---------------------------------------------------------------------------

export interface UnmappedExtension {
  rcExtensionId: string;
  calls: number;
  lastSeen: Date;
}

export interface UnmappedAzProducer {
  azProducerId: string;
  leads: number;
  quotes: number;
  policies: number;
}

export async function getUnmapped(agencyId: string): Promise<{
  extensions: UnmappedExtension[];
  azProducers: UnmappedAzProducer[];
}> {
  const [extensions, azProducers] = await Promise.all([
    prisma.$queryRaw<UnmappedExtension[]>`
      SELECT c.rc_extension_id AS "rcExtensionId", COUNT(*)::int AS calls, MAX(c.start_time) AS "lastSeen"
      FROM calls c
      WHERE c.agency_id = ${agencyId}
        AND c.rc_extension_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM producer_identity_map m
          WHERE m.agency_id = c.agency_id AND m.rc_extension_id = c.rc_extension_id
        )
      GROUP BY 1
      ORDER BY calls DESC`,
    prisma.$queryRaw<UnmappedAzProducer[]>`
      SELECT ids.az_producer_id AS "azProducerId",
             COALESCE(SUM(ids.leads), 0)::int AS leads,
             COALESCE(SUM(ids.quotes), 0)::int AS quotes,
             COALESCE(SUM(ids.policies), 0)::int AS policies
      FROM (
        SELECT az_producer_id, 1 AS leads, 0 AS quotes, 0 AS policies FROM leads WHERE agency_id = ${agencyId} AND az_producer_id IS NOT NULL
        UNION ALL
        SELECT az_producer_id, 0, 1, 0 FROM quotes WHERE agency_id = ${agencyId} AND az_producer_id IS NOT NULL
        UNION ALL
        SELECT az_producer_id, 0, 0, 1 FROM policies_sold WHERE agency_id = ${agencyId} AND az_producer_id IS NOT NULL
      ) ids
      WHERE NOT EXISTS (
        SELECT 1 FROM producer_identity_map m
        WHERE m.agency_id = ${agencyId} AND m.az_producer_id = ids.az_producer_id
      )
      GROUP BY 1
      ORDER BY leads DESC`,
  ]);
  return { extensions, azProducers };
}

// ---------------------------------------------------------------------------
// Identity map CRUD
// ---------------------------------------------------------------------------

export interface IdentityMapInput {
  displayName: string;
  roleTitle: string;
  rcExtensionId: string | null;
  azProducerId: string | null;
  isRamping: boolean;
  active: boolean;
}

export async function listIdentityMap(agencyId: string) {
  return prisma.producerIdentityMap.findMany({
    where: { agencyId },
    orderBy: [{ active: "desc" }, { displayName: "asc" }],
  });
}

export async function createIdentityMapping(agencyId: string, input: IdentityMapInput) {
  return prisma.producerIdentityMap.create({ data: { agencyId, ...input } });
}

export async function updateIdentityMapping(agencyId: string, id: string, input: IdentityMapInput) {
  // Scope the update by agency: updateMany + refetch keeps tenants isolated.
  const updated = await prisma.producerIdentityMap.updateMany({ where: { id, agencyId }, data: input });
  if (updated.count === 0) throw new Error("Mapping not found");
  return prisma.producerIdentityMap.findUniqueOrThrow({ where: { id } });
}
