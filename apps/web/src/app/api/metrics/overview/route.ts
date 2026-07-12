import { NextResponse, type NextRequest } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getOverviewKpis } from "@/lib/data/metrics";
import { resolveRange } from "@/lib/range";

export async function GET(req: NextRequest) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const { range, days } = resolveRange(params);
  const kpis = await getOverviewKpis(agency.id, range);
  return NextResponse.json({ range: { from: range.from, to: range.to, days }, ...kpis });
}
