// Enqueue a job for the (single) agency from the CLI:
//   pnpm --filter @anchorline/worker enqueue sync_ringcentral
//   pnpm --filter @anchorline/worker enqueue transcribe_call '{"callId":"..."}'
// The running worker picks it up within one poll interval.

import "../src/env";
import { prisma, type Prisma } from "@anchorline/db";

const type = process.argv[2];
if (!type) {
  console.error("Usage: pnpm enqueue <job-type> [payload-json]   e.g. pnpm enqueue sync_ringcentral");
  process.exit(1);
}
const payload = process.argv[3] ? (JSON.parse(process.argv[3]) as Prisma.InputJsonValue) : undefined;

const agency = await prisma.agency.findFirstOrThrow();
const job = await prisma.job.create({ data: { agencyId: agency.id, type, payload } });
console.log(`Enqueued ${job.type} (${job.id}) for ${agency.name}`);
await prisma.$disconnect();
