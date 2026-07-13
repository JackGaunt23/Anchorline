// RingCentral call sync (job type "sync_ringcentral").
//
// Watermarked and idempotent: resume from the last successful run's
// watermark_to minus an overlap buffer (call-log records appear 15–30s after
// the call ends and recordings attach even later, so recent records are
// re-fetched and upserted by rc_session_id). The first run backfills
// RC_SYNC_LOOKBACK_DAYS. Consumes the CallProvider interface, so the same
// handler runs end-to-end against the mock provider in demo mode.

import { prisma, Prisma, type Job } from "@anchorline/db";
import { getCallProvider } from "@anchorline/providers";

const DAY_MS = 86_400_000;
const OVERLAP_MS = 10 * 60_000;
const DEFAULT_LOOKBACK_DAYS = 90;

export async function syncRingCentral(job: Job): Promise<void> {
  await runRingCentralSync(job.agencyId);
}

export interface RingCentralSyncOutcome {
  recordsUpserted: number;
  watermarkFrom: Date;
  watermarkTo: Date;
}

export async function runRingCentralSync(agencyId: string): Promise<RingCentralSyncOutcome> {
  const watermarkTo = new Date();
  const watermarkFrom = await resolveWatermarkFrom(agencyId, watermarkTo);
  const run = await prisma.syncRun.create({
    data: { agencyId, source: "ringcentral", status: "running", watermarkFrom },
  });

  const provider = getCallProvider();
  let upserted = 0;
  try {
    let cursor: string | undefined;
    do {
      const { calls, nextCursor } = await provider.listCalls({ from: watermarkFrom, to: watermarkTo, cursor });
      for (const call of calls) {
        const data = {
          rcExtensionId: call.rcExtensionId,
          direction: call.direction,
          startTime: call.startTime,
          durationSeconds: call.durationSeconds,
          result: call.result,
          fromNumber: call.fromNumber,
          toNumber: call.toNumber,
          hasRecording: call.hasRecording,
          recordingContentUri: call.recordingContentUri,
          raw: call.raw as Prisma.InputJsonValue,
        };
        await prisma.call.upsert({
          where: { agencyId_rcSessionId: { agencyId, rcSessionId: call.rcSessionId } },
          create: { agencyId, rcSessionId: call.rcSessionId, ...data },
          update: data,
        });
        upserted += 1;
      }
      cursor = nextCursor;
    } while (cursor);

    // Phase 4 hooks in here: enqueue transcribe_call jobs for calls with a
    // recording and durationSeconds >= MIN_TRANSCRIBE_SECONDS.

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "success", finishedAt: new Date(), watermarkTo, recordsUpserted: upserted },
    });
    return { recordsUpserted: upserted, watermarkFrom, watermarkTo };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        recordsUpserted: upserted,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function resolveWatermarkFrom(agencyId: string, now: Date): Promise<Date> {
  const last = await prisma.syncRun.findFirst({
    where: { agencyId, source: "ringcentral", status: "success", watermarkTo: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  if (last?.watermarkTo) return new Date(last.watermarkTo.getTime() - OVERLAP_MS);
  const lookbackDays = Number(process.env.RC_SYNC_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS;
  return new Date(now.getTime() - lookbackDays * DAY_MS);
}
