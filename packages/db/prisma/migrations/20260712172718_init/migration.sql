-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('pending', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "SyncSource" AS ENUM ('ringcentral', 'agencyzoom');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_identity_map" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role_title" TEXT NOT NULL DEFAULT 'Producer',
    "rc_extension_id" TEXT,
    "az_producer_id" TEXT,
    "is_ramping" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producer_identity_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "rc_session_id" TEXT NOT NULL,
    "rc_extension_id" TEXT,
    "direction" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "result" TEXT,
    "from_number" TEXT,
    "to_number" TEXT,
    "has_recording" BOOLEAN NOT NULL DEFAULT false,
    "recording_content_uri" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_transcripts" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "transcript_text" TEXT,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_scores" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "score_0_100" INTEGER NOT NULL,
    "rapport" BOOLEAN NOT NULL,
    "discovery" BOOLEAN NOT NULL,
    "quote_presented" BOOLEAN NOT NULL,
    "objection_handling" BOOLEAN NOT NULL,
    "close_attempted" BOOLEAN NOT NULL,
    "summary_text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "az_lead_id" TEXT NOT NULL,
    "az_producer_id" TEXT,
    "status_code" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "create_date" TIMESTAMP(3),
    "contact_date" TIMESTAMP(3),
    "quote_date" TIMESTAMP(3),
    "sold_date" TIMESTAMP(3),
    "last_activity_date" TIMESTAMP(3),
    "quoted_premium_cents" INTEGER,
    "sold_premium_cents" INTEGER,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "az_quote_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "az_producer_id" TEXT,
    "product_line" TEXT,
    "carrier" TEXT,
    "premium_cents" INTEGER,
    "sold" BOOLEAN NOT NULL DEFAULT false,
    "quoted_at" TIMESTAMP(3) NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies_sold" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "az_producer_id" TEXT,
    "product_line" TEXT NOT NULL DEFAULT 'unknown',
    "premium_cents" INTEGER NOT NULL,
    "sold_date" TIMESTAMP(3) NOT NULL,
    "effective_date" TIMESTAMP(3),
    "policy_number" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_sold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "source" "SyncSource" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "watermark_from" TIMESTAMP(3),
    "watermark_to" TIMESTAMP(3),
    "records_upserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "for_date" DATE NOT NULL,
    "summary_text" TEXT NOT NULL,
    "insights" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "producer_identity_map_agency_id_rc_extension_id_key" ON "producer_identity_map"("agency_id", "rc_extension_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_identity_map_agency_id_az_producer_id_key" ON "producer_identity_map"("agency_id", "az_producer_id");

-- CreateIndex
CREATE INDEX "calls_agency_id_start_time_idx" ON "calls"("agency_id", "start_time");

-- CreateIndex
CREATE INDEX "calls_agency_id_rc_extension_id_start_time_idx" ON "calls"("agency_id", "rc_extension_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "calls_agency_id_rc_session_id_key" ON "calls"("agency_id", "rc_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_transcripts_call_id_key" ON "call_transcripts"("call_id");

-- CreateIndex
CREATE INDEX "call_transcripts_agency_id_status_idx" ON "call_transcripts"("agency_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "call_scores_call_id_key" ON "call_scores"("call_id");

-- CreateIndex
CREATE INDEX "call_scores_agency_id_created_at_idx" ON "call_scores"("agency_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_agency_id_last_activity_date_idx" ON "leads"("agency_id", "last_activity_date");

-- CreateIndex
CREATE INDEX "leads_agency_id_sold_date_idx" ON "leads"("agency_id", "sold_date");

-- CreateIndex
CREATE UNIQUE INDEX "leads_agency_id_az_lead_id_key" ON "leads"("agency_id", "az_lead_id");

-- CreateIndex
CREATE INDEX "quotes_agency_id_quoted_at_idx" ON "quotes"("agency_id", "quoted_at");

-- CreateIndex
CREATE INDEX "quotes_agency_id_az_producer_id_quoted_at_idx" ON "quotes"("agency_id", "az_producer_id", "quoted_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_agency_id_az_quote_id_key" ON "quotes"("agency_id", "az_quote_id");

-- CreateIndex
CREATE INDEX "policies_sold_agency_id_sold_date_idx" ON "policies_sold"("agency_id", "sold_date");

-- CreateIndex
CREATE INDEX "policies_sold_agency_id_az_producer_id_sold_date_idx" ON "policies_sold"("agency_id", "az_producer_id", "sold_date");

-- CreateIndex
CREATE UNIQUE INDEX "policies_sold_agency_id_lead_id_product_line_key" ON "policies_sold"("agency_id", "lead_id", "product_line");

-- CreateIndex
CREATE INDEX "sync_runs_agency_id_source_started_at_idx" ON "sync_runs"("agency_id", "source", "started_at");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "daily_summaries_agency_id_for_date_idx" ON "daily_summaries"("agency_id", "for_date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_identity_map" ADD CONSTRAINT "producer_identity_map_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_scores" ADD CONSTRAINT "call_scores_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_scores" ADD CONSTRAINT "call_scores_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies_sold" ADD CONSTRAINT "policies_sold_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies_sold" ADD CONSTRAINT "policies_sold_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
