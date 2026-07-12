import { NextResponse, type NextRequest } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getTrend } from "@/lib/data/metrics";
import { resolveRange } from "@/lib/range";

export async function GET(req: NextRequest) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const { range } = resolveRange(params);
  const days = await getTrend(agency.id, range.to);
  return NextResponse.json({ days });
}
