import { NextResponse } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getIntegrations, getSyncLog } from "@/lib/data/settings";

export async function GET() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const [integrations, syncLog] = await Promise.all([getIntegrations(agency.id), getSyncLog(agency.id)]);
  return NextResponse.json({ ...integrations, syncLog });
}
