import { NextResponse } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getUnmapped } from "@/lib/data/settings";

export async function GET() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const unmapped = await getUnmapped(agency.id);
  return NextResponse.json(unmapped);
}
