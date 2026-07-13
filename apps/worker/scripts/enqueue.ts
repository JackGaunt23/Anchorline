// Enqueue a job for the (single) agency from the CLI:
//   pnpm --filter @anchorline/worker enqueue sync_ringcentral
// The running worker picks it up within one poll interval.

import "../src/env";
import { prisma } from "@anchorline/db";

const type = process.argv[2];
if (!type) {
  console.error("Usage: pnpm enqueue <job-type>   e.g. pnpm enqueue sync_ringcentral");
  process.exit(1);
}

const agency = await prisma.agency.findFirstOrThrow();
const job = await prisma.job.create({ data: { agencyId: agency.id, type } });
console.log(`Enqueued ${job.type} (${job.id}) for ${agency.name}`);
await prisma.$disconnect();
