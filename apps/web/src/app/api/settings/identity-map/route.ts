import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, requireAgency, unauthorized } from "@/lib/api";
import { createIdentityMapping, listIdentityMap, updateIdentityMapping } from "@/lib/data/settings";

const mappingSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(120),
  roleTitle: z.string().trim().min(1).max(120).default("Producer"),
  rcExtensionId: z
    .string()
    .trim()
    .max(40)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .default(null),
  azProducerId: z
    .string()
    .trim()
    .max(40)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .default(null),
  isRamping: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function GET() {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const mappings = await listIdentityMap(agency.id);
  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const parsed = mappingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid mapping");
  try {
    const mapping = await createIdentityMapping(agency.id, parsed.data);
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (err) {
    return conflictOr500(err);
  }
}

export async function PUT(req: NextRequest) {
  const agency = await requireAgency();
  if (!agency) return unauthorized();
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id || typeof body.id !== "string") return badRequest("Mapping id is required");
  const parsed = mappingSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid mapping");
  try {
    const mapping = await updateIdentityMapping(agency.id, body.id, parsed.data);
    return NextResponse.json({ mapping });
  } catch (err) {
    if (err instanceof Error && err.message === "Mapping not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return conflictOr500(err);
  }
}

/** Unique-constraint violations become a friendly 409 (duplicate RC ext / AZ id). */
function conflictOr500(err: unknown) {
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
    return NextResponse.json(
      { error: "That RingCentral extension or AgencyZoom producer ID is already mapped." },
      { status: 409 },
    );
  }
  console.error("identity-map error:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
