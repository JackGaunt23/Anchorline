import { NextResponse } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getLatestSummary } from "@/lib/data/summary";

export async function GET() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const summary = await getLatestSummary(agency.id);
  return NextResponse.json({ summary });
}
