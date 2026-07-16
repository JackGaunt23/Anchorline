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
import { transcriptProviderName } from "./transcribe-call";

const DAY_MS = 86_400_000;
const OVERLAP_MS = 10 * 60_000;
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MIN_TRANSCRIBE_SECONDS = 120;

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
          contactName: call.contactName,
          counterpartyNumber: call.counterpartyNumber,
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

    await enqueueTranscriptions(agencyId, watermarkFrom);

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

/**
 * Enqueue transcribe_call jobs for recorded calls of at least
 * MIN_TRANSCRIBE_SECONDS that don't have a transcript yet. The pending
 * call_transcripts row is created here so overlapping sync windows (and
 * back-to-back runs) can't enqueue a call twice.
 *
 * Scans from a day before the sync window rather than the window itself:
 * recordings attach to call-log records after the fact, so hasRecording can
 * flip to true on an overlap re-fetch, and a run that crashed between upsert
 * and enqueue gets picked up by the next one. The first (backfill) run's
 * watermark reaches the full lookback, so historical recordings are queued
 * too — recording retention on RingCentral's side decides what's still
 * downloadable.
 */
async function enqueueTranscriptions(agencyId: string, watermarkFrom: Date): Promise<number> {
  const minSeconds = Number(process.env.MIN_TRANSCRIBE_SECONDS) || DEFAULT_MIN_TRANSCRIBE_SECONDS;
  const candidates = await prisma.call.findMany({
    where: {
      agencyId,
      hasRecording: true,
      recordingContentUri: { not: null },
      durationSeconds: { gte: minSeconds },
      startTime: { gte: new Date(watermarkFrom.getTime() - DAY_MS) },
      transcript: null,
    },
    select: { id: true },
  });
  for (const call of candidates) {
    await prisma.callTranscript.create({
      data: { agencyId, callId: call.id, provider: transcriptProviderName(), status: "pending" },
    });
    await prisma.job.create({
      data: { agencyId, type: "transcribe_call", payload: { callId: call.id } },
    });
  }
  return candidates.length;
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
