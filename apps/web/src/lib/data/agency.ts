import { cache } from "react";
import { prisma, type Agency } from "@anchorline/db";

/** Single-tenant: the one seeded agency. Cached per request. */
export const getAgency = cache(async (): Promise<Agency> => {
  const agency = await prisma.agency.findFirst();
  if (!agency) throw new Error("No agency found — run `pnpm db:seed` first.");
  return agency;
});
