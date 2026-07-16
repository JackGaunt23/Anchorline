-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM ('quoted', 'follow_up_needed', 'not_interested', 'sale_closed');

-- AlterTable
ALTER TABLE "calls"
ADD COLUMN "contact_name" TEXT,
ADD COLUMN "counterparty_number" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "contact_name" TEXT;

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "call_id" TEXT,
    "contact_label" TEXT NOT NULL,
    "disposition" "CallDisposition" NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_agency_id_counterparty_number_start_time_idx" ON "calls"("agency_id", "counterparty_number", "start_time");

-- CreateIndex
CREATE INDEX "call_logs_agency_id_created_at_idx" ON "call_logs"("agency_id", "created_at");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE calls SET
  counterparty_number = CASE WHEN direction = 'Outbound' THEN to_number ELSE from_number END,
  contact_name = CASE WHEN direction = 'Outbound' THEN raw->'to'->>'name' ELSE raw->'from'->>'name' END
WHERE counterparty_number IS NULL;

UPDATE leads SET
  contact_name = NULLIF(TRIM(CONCAT_WS(' ', raw->>'firstname', raw->>'lastname')), '')
WHERE contact_name IS NULL;
