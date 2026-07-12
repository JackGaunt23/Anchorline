// Anchorline worker: cron schedules + DB-backed job queue poller.
//
// Phase 0 ships the queue loop skeleton; job handlers arrive with their
// phases (call sync in 2, CRM sync in 3, transcription/scoring in 4, daily
// summary in 5).

import "./env";
import { prisma, type Job } from "@anchorline/db";

const POLL_INTERVAL_MS = 5_000;

type JobHandler = (job: Job) => Promise<void>;

// Handlers register here as phases land: sync_ringcentral, sync_agencyzoom,
// transcribe_call, score_call, generate_daily_summary.
const handlers: Record<string, JobHandler> = {};

/** Claim the next runnable job with FOR UPDATE SKIP LOCKED (multi-worker safe). */
async function claimJob(): Promise<Job | null> {
  // Aliases map snake_case columns onto the Prisma Job field names.
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE jobs SET status = 'running', updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= now()
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, agency_id AS "agencyId", type, payload, status,
      run_at AS "runAt", attempts, max_attempts AS "maxAttempts",
      last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"`;
  return rows[0] ?? null;
}

async function runOnce(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;

  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    await handler(job);
    await prisma.job.update({ where: { id: job.id }, data: { status: "done" } });
  } catch (err) {
    const attempts = job.attempts + 1;
    const failedForGood = attempts >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: failedForGood ? "failed" : "queued",
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
        // Exponential backoff: 1m, 4m, 9m...
        runAt: failedForGood ? job.runAt : new Date(Date.now() + attempts * attempts * 60_000),
      },
    });
    console.error(`Job ${job.id} (${job.type}) attempt ${attempts} failed:`, err);
  }
  return true;
}

async function loop() {
  console.log(`Anchorline worker started (DATA_MODE=${process.env.DATA_MODE ?? "demo"}).`);
  // Drain available jobs, then idle-poll.
  for (;;) {
    try {
      const worked = await runOnce();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

loop().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
