import { NextResponse, type NextRequest } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getProducerRows } from "@/lib/data/metrics";
import { resolveRange } from "@/lib/range";

export async function GET(req: NextRequest) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const { range } = resolveRange(params);
  const producers = await getProducerRows(agency.id, range);
  return NextResponse.json({ producers });
}
