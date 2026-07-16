// Call scoring (job type "score_call", payload { callId }).
//
// Feeds a completed transcript to the CallScorer (OpenAI rubric prompt in
// live mode, fixture scorecards in demo mode) and persists the validated
// result to call_scores. Idempotent: a call with an existing score is left
// untouched. Invalid model output is retried once inside the scorer; a
// second failure throws, so the queue's retry/backoff applies before the job
// is marked failed for good.

import { prisma, Prisma, type Job } from "@anchorline/db";
import { getCallScorer } from "@anchorline/providers";

interface ScorePayload {
  callId?: string;
}

export async function scoreCall(job: Job): Promise<void> {
  const payload = (job.payload ?? {}) as ScorePayload;
  if (!payload.callId) throw new Error("score_call job is missing payload.callId");

  const call = await prisma.call.findUnique({
    where: { id: payload.callId },
    include: { transcript: true, score: true },
  });
  if (!call) throw new Error(`score_call: call ${payload.callId} not found`);
  if (call.score) return;

  const transcript = call.transcript;
  if (!transcript || transcript.status !== "done" || !transcript.transcriptText) {
    throw new Error(`score_call: call ${call.id} has no completed transcript (status: ${transcript?.status ?? "none"})`);
  }

  const { result, model, promptVersion, raw } = await getCallScorer().scoreCall({
    transcript: transcript.transcriptText,
    rcSessionId: call.rcSessionId,
  });

  await prisma.callScore.create({
    data: {
      agencyId: call.agencyId,
      callId: call.id,
      score: result.score,
      rapport: result.rapport,
      discovery: result.discovery_questions,
      quotePresented: result.quote_presented,
      objectionHandling: result.objection_handling,
      closeAttempted: result.close_attempted,
      summaryText: result.summary,
      model,
      promptVersion,
      raw: raw as Prisma.InputJsonValue,
    },
  });
}
