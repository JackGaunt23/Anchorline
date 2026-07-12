import { NextResponse, type NextRequest } from "next/server";
import { requireAgency, unauthorized } from "@/lib/api";
import { getScoredCalls } from "@/lib/data/metrics";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const { id } = await ctx.params;
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page")) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize")) || 10));
  const result = await getScoredCalls(agency.id, id, page, pageSize);
  return NextResponse.json(result);
}
