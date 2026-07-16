import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@anchorline/db";
import { auth } from "@/auth";
import { badRequest, requireAgency, unauthorized } from "@/lib/api";

const bodySchema = z.object({
  contactLabel: z.string().trim().min(1),
  disposition: z.enum(["quoted", "follow_up_needed", "not_interested", "sale_closed"]),
  notes: z.string().optional(),
  callId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const [agency, session] = await Promise.all([requireAgency(), auth()]);
  if (!agency || !session?.user) return unauthorized();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid call outcome");

  if (parsed.data.callId) {
    const call = await prisma.call.findFirst({
      where: { id: parsed.data.callId, agencyId: agency.id },
      select: { id: true },
    });
    if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const row = await prisma.callLog.create({
    data: {
      agencyId: agency.id,
      callId: parsed.data.callId,
      contactLabel: parsed.data.contactLabel,
      disposition: parsed.data.disposition,
      notes: parsed.data.notes?.trim() || null,
      createdBy: session.user.email ?? null,
    },
    select: { id: true },
  });
  return NextResponse.json(row, { status: 201 });
}
