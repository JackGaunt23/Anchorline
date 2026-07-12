import { NextResponse } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getPremiumMonthly } from "@/lib/data/metrics";

export async function GET() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const { months } = await getPremiumMonthly(agency.id);
  return NextResponse.json({ months });
}
