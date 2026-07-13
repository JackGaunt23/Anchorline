// Call transcription (job type "transcribe_call", payload { callId }).
//
// Downloads the recording through the CallProvider and transcribes it through
// the TranscriptionProvider, so demo mode runs the identical pipeline against
// the mock recording/transcripts. The call_transcripts row (created pending
// at enqueue time as the dedupe marker) tracks progress and holds the result.
//
// Recordings become available after the call-log record does, so a 404 from
// the recording download is not a failure: the job re-schedules itself with
// growing delays (tracked in payload.notReadyRetries, separate from the
// queue's error-retry attempts) until the recording appears or the patience
// budget runs out. Completion enqueues the score_call job.

import { prisma, type Job } from "@anchorline/db";
import { getCallProvider, getTranscriptionProvider, isDemoMode, RingCentralApiError } from "@anchorline/providers";

/** Re-check delays of 1, 2, 4, ... capped at 60 minutes — about 3.5h of patience. */
const NOT_READY_MAX_RETRIES = 8;
const NOT_READY_MAX_DELAY_MINUTES = 60;
const MINUTE_MS = 60_000;

interface TranscribePayload {
  callId?: string;
  notReadyRetries?: number;
}

export function transcriptProviderName(): string {
  return isDemoMode() ? "demo" : "deepgram";
}

export async function transcribeCall(job: Job): Promise<void> {
  const payload = (job.payload ?? {}) as TranscribePayload;
  if (!payload.callId) throw new Error("transcribe_call job is missing payload.callId");

  const call = await prisma.call.findUnique({
    where: { id: payload.callId },
    include: { transcript: true, score: true },
  });
  if (!call) throw new Error(`transcribe_call: call ${payload.callId} not found`);
  if (!call.recordingContentUri) throw new Error(`transcribe_call: call ${call.id} has no recording`);

  // Already transcribed (job re-run after a partial failure): just make sure
  // scoring is queued.
  if (call.transcript?.status === "done") {
    if (!call.score) await enqueueScoreJob(call.agencyId, call.id);
    return;
  }

  await prisma.callTranscript.upsert({
    where: { callId: call.id },
    create: { agencyId: call.agencyId, callId: call.id, provider: transcriptProviderName(), status: "processing" },
    update: { status: "processing", provider: transcriptProviderName(), error: null },
  });

  let audio: { bytes: Uint8Array; contentType: string };
  try {
    audio = await getCallProvider().getRecordingAudio(call.recordingContentUri);
  } catch (err) {
    if (err instanceof RingCentralApiError && err.status === 404) {
      await rescheduleNotReady(call.agencyId, call.id, payload.notReadyRetries ?? 0);
      return;
    }
    await markFailed(call.id, err);
    throw err;
  }

  try {
    const { text } = await getTranscriptionProvider().transcribe(audio);
    await prisma.callTranscript.update({
      where: { callId: call.id },
      data: { status: "done", transcriptText: text, error: null },
    });
  } catch (err) {
    await markFailed(call.id, err);
    throw err;
  }

  if (!call.score) await enqueueScoreJob(call.agencyId, call.id);
}

async function enqueueScoreJob(agencyId: string, callId: string): Promise<void> {
  await prisma.job.create({ data: { agencyId, type: "score_call", payload: { callId } } });
}

/** Recording not available yet: back to pending and try again later. */
async function rescheduleNotReady(agencyId: string, callId: string, retries: number): Promise<void> {
  if (retries >= NOT_READY_MAX_RETRIES) {
    await prisma.callTranscript.update({
      where: { callId },
      data: { status: "failed", error: `Recording still unavailable (404) after ${retries} re-checks` },
    });
    return;
  }
  const delayMinutes = Math.min(2 ** retries, NOT_READY_MAX_DELAY_MINUTES);
  await prisma.callTranscript.update({ where: { callId }, data: { status: "pending" } });
  await prisma.job.create({
    data: {
      agencyId,
      type: "transcribe_call",
      payload: { callId, notReadyRetries: retries + 1 },
      runAt: new Date(Date.now() + delayMinutes * MINUTE_MS),
    },
  });
}

/** Record the error on the transcript; the queue's retry policy re-runs the job. */
async function markFailed(callId: string, err: unknown): Promise<void> {
  await prisma.callTranscript.update({
    where: { callId },
    data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
  });
}
