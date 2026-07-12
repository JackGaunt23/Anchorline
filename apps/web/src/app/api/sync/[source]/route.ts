import { NextResponse, type NextRequest } from "next/server";
import { badRequest, requireAgency, unauthorized } from "@/lib/api";
import { runManualSync, type SyncSourceName } from "@/lib/data/sync";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const { source } = await ctx.params;
  if (source !== "ringcentral" && source !== "agencyzoom") {
    return badRequest(`Unknown sync source "${source}"`);
  }
  const result = await runManualSync(agency.id, source as SyncSourceName);
  return NextResponse.json(result);
}
