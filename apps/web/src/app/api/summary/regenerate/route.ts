import { NextResponse } from "next/server";
import { badRequest, requireAgency, unauthorized } from "@/lib/api";
import { regenerateSummary } from "@/lib/data/summary";

export async function POST() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  try {
    const summary = await regenerateSummary(agency.id);
    return NextResponse.json({ summary });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Could not regenerate summary");
  }
}
