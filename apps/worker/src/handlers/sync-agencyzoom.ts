// AgencyZoom CRM sync.
//
// AgencyZoom's rate limit (30 req/min daytime) plus the lack of a global
// quotes endpoint shape this sync:
// - Leads page cheaply (100/page) sorted ascending by lastActivityDate, so
//   the watermark doubles as a resume pointer.
// - Quotes cost one request per lead. Each run spends at most
//   AZ_QUOTE_FETCH_BUDGET quote fetches (default 200, ~8 min of wall time at
//   the 25/min throttle), then stops with the watermark at the last fully
//   processed lead; a large backfill drains across runs.
// - Leads whose synced fields are unchanged are skipped entirely (no quote
//   fetch, no derivation), so re-covered watermark overlap costs nothing and
//   a stopped run always makes progress on the next attempt.
//
// Sold policies are derived, not fetched: a sold lead produces one
// policies_sold row per distinct sold-quote product line (lead-level premium
// apportioned by quote premium weight), or a single "unknown" row when no
// sold quote detail exists. Rows no longer supported by the derivation are
// deleted, keeping the per-lead premium invariant exact.

import { prisma, type Job, type Lead, type Prisma, type Quote } from "@anchorline/db";
import { getCrmProvider, type NormalizedLead, type NormalizedQuote } from "@anchorline/providers";

const DAY_MS = 86_400_000;
/** lastActivityDate is date-granularity, so overlap a full day. */
const OVERLAP_MS = DAY_MS;
const DEFAULT_LOOKBACK_DAYS = 365;
const DEFAULT_QUOTE_FETCH_BUDGET = 200;

export async function syncAgencyZoom(job: Job): Promise<void> {
  await runAgencyZoomSync(job.agencyId);
}

export interface AgencyZoomSyncOutcome {
  leadsUpserted: number;
  quotesUpserted: number;
  policiesUpserted: number;
  quoteFetches: number;
  /** False when the quote budget ran out before the lead stream did. */
  drained: boolean;
  watermarkFrom: Date;
  watermarkTo: Date;
}

export async function runAgencyZoomSync(agencyId: string): Promise<AgencyZoomSyncOutcome> {
  const startedAt = new Date();
  const watermarkFrom = await resolveWatermarkFrom(agencyId, startedAt);
  const run = await prisma.syncRun.create({
    data: { agencyId, source: "agencyzoom", status: "running", watermarkFrom },
  });

  const provider = getCrmProvider();
  const budget = Number(process.env.AZ_QUOTE_FETCH_BUDGET) || DEFAULT_QUOTE_FETCH_BUDGET;

  let leadsUpserted = 0;
  let quotesUpserted = 0;
  let policiesUpserted = 0;
  let quoteFetches = 0;
  let lastProcessedActivity: Date | null = null;
  let drained = true;

  try {
    let cursor: string | undefined;
    paging: do {
      const { leads, nextCursor } = await provider.listLeads({ activitySince: watermarkFrom, cursor });
      for (const lead of leads) {
        const existing = await prisma.lead.findUnique({
          where: { agencyId_azLeadId: { agencyId, azLeadId: lead.azLeadId } },
        });
        if (existing && !leadChanged(existing, lead)) {
          lastProcessedActivity = lead.lastActivityDate ?? lastProcessedActivity;
          continue;
        }
        // A changed lead that may carry quotes costs one budgeted request; if
        // the budget is spent, leave it (and everything after it) untouched
        // so the watermark stops short and the next run picks it up.
        if (mayHaveQuotes(lead) && quoteFetches >= budget) {
          drained = false;
          break paging;
        }

        const dbLead = await upsertLead(agencyId, lead);
        leadsUpserted += 1;

        let leadQuotes: Quote[];
        if (mayHaveQuotes(lead)) {
          const fetched = await provider.listLeadQuotes(lead.azLeadId);
          quoteFetches += 1;
          for (const quote of fetched) {
            await upsertQuote(agencyId, dbLead, lead, quote, startedAt);
            quotesUpserted += 1;
          }
          leadQuotes = await prisma.quote.findMany({ where: { agencyId, leadId: dbLead.id } });
        } else {
          leadQuotes = [];
        }

        policiesUpserted += await derivePolicies(agencyId, dbLead, leadQuotes);
        lastProcessedActivity = lead.lastActivityDate ?? lastProcessedActivity;
      }
      cursor = nextCursor;
    } while (cursor);

    // Fully drained: everything up to the run start is ingested. Stopped
    // early: resume from the last lead we actually finished.
    const watermarkTo = drained ? startedAt : (lastProcessedActivity ?? watermarkFrom);
    const recordsUpserted = leadsUpserted + quotesUpserted + policiesUpserted;
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "success", finishedAt: new Date(), watermarkTo, recordsUpserted },
    });
    return { leadsUpserted, quotesUpserted, policiesUpserted, quoteFetches, drained, watermarkFrom, watermarkTo };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        recordsUpserted: leadsUpserted + quotesUpserted + policiesUpserted,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err; // let the job queue retry with backoff
  }
}

async function resolveWatermarkFrom(agencyId: string, now: Date): Promise<Date> {
  const last = await prisma.syncRun.findFirst({
    where: { agencyId, source: "agencyzoom", status: "success", watermarkTo: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  if (last?.watermarkTo) return new Date(last.watermarkTo.getTime() - OVERLAP_MS);
  const lookbackDays = Number(process.env.AZ_SYNC_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS;
  return new Date(now.getTime() - lookbackDays * DAY_MS);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/** The synced fields that, when unchanged, let us skip a lead entirely. */
function leadChanged(existing: Lead, lead: NormalizedLead): boolean {
  return (
    existing.statusCode !== lead.statusCode ||
    existing.azProducerId !== lead.azProducerId ||
    existing.source !== lead.source ||
    existing.quotedPremiumCents !== lead.quotedPremiumCents ||
    existing.soldPremiumCents !== lead.soldPremiumCents ||
    !sameInstant(existing.lastActivityDate, lead.lastActivityDate) ||
    !sameInstant(existing.quoteDate, lead.quoteDate) ||
    !sameInstant(existing.soldDate, lead.soldDate) ||
    !sameInstant(existing.contactDate, lead.contactDate) ||
    !sameInstant(existing.createDate, lead.createDate)
  );
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

/** Only leads that ever reached quoting can have quotes worth a request. */
function mayHaveQuotes(lead: NormalizedLead): boolean {
  return (
    lead.quoteDate !== null ||
    (lead.quotedPremiumCents ?? 0) > 0 ||
    (lead.soldPremiumCents ?? 0) > 0 ||
    lead.statusCode === 1 || // quoted
    lead.statusCode === 2 // won
  );
}

async function upsertLead(agencyId: string, lead: NormalizedLead): Promise<Lead> {
  const data = {
    azProducerId: lead.azProducerId,
    statusCode: lead.statusCode,
    status: lead.status,
    source: lead.source,
    createDate: lead.createDate,
    contactDate: lead.contactDate,
    quoteDate: lead.quoteDate,
    soldDate: lead.soldDate,
    lastActivityDate: lead.lastActivityDate,
    quotedPremiumCents: lead.quotedPremiumCents,
    soldPremiumCents: lead.soldPremiumCents,
    raw: lead.raw as Prisma.InputJsonValue,
  };
  return prisma.lead.upsert({
    where: { agencyId_azLeadId: { agencyId, azLeadId: lead.azLeadId } },
    create: { agencyId, azLeadId: lead.azLeadId, ...data },
    update: data,
  });
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

async function upsertQuote(
  agencyId: string,
  dbLead: Lead,
  lead: NormalizedLead,
  quote: NormalizedQuote,
  now: Date,
): Promise<void> {
  const data = {
    azProducerId: lead.azProducerId,
    productLine: quote.productLine,
    carrier: quote.carrier,
    premiumCents: quote.premiumCents,
    sold: quote.sold,
    raw: quote.raw as Prisma.InputJsonValue,
  };
  await prisma.quote.upsert({
    where: { agencyId_azQuoteId: { agencyId, azQuoteId: quote.azQuoteId } },
    // Quotes carry no timestamp: date them by the lead's quoteDate, falling
    // back to when this sync first saw them (both retained on updates).
    create: {
      agencyId,
      azQuoteId: quote.azQuoteId,
      leadId: dbLead.id,
      ...data,
      quotedAt: lead.quoteDate ?? now,
      firstSeenAt: now,
    },
    update: { ...data, ...(lead.quoteDate && { quotedAt: lead.quoteDate }) },
  });
}

// ---------------------------------------------------------------------------
// Sold-policy derivation
// ---------------------------------------------------------------------------

interface DerivedPolicy {
  productLine: string;
  premiumCents: number;
  effectiveDate: Date | null;
}

/** The quotes table doesn't persist effectiveDate; read it from the raw payload. */
function quoteEffectiveDate(quote: Quote): Date | null {
  const raw = quote.raw as { effectiveDate?: string } | null;
  if (!raw?.effectiveDate) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveDate) ? `${raw.effectiveDate}T00:00:00Z` : raw.effectiveDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Splits the lead's sold premium across its sold quotes' distinct product
 * lines, weighted by quote premium (equal split when quotes carry none).
 * Rounding drift lands on the first line so the rows always sum exactly to
 * the lead premium.
 */
export function apportionSoldPremium(soldPremiumCents: number, soldQuotes: Quote[]): DerivedPolicy[] {
  const lines = new Map<string, { weight: number; effectiveDate: Date | null }>();
  for (const q of soldQuotes) {
    const line = q.productLine ?? "unknown";
    const entry = lines.get(line) ?? { weight: 0, effectiveDate: null };
    entry.weight += q.premiumCents ?? 0;
    const effective = quoteEffectiveDate(q);
    if (effective && (!entry.effectiveDate || effective < entry.effectiveDate)) {
      entry.effectiveDate = effective;
    }
    lines.set(line, entry);
  }
  if (lines.size === 0) {
    return [{ productLine: "unknown", premiumCents: soldPremiumCents, effectiveDate: null }];
  }

  const entries = [...lines.entries()];
  const totalWeight = entries.reduce((sum, [, e]) => sum + e.weight, 0);
  const rows = entries.map(([productLine, e]) => ({
    productLine,
    premiumCents:
      totalWeight > 0
        ? Math.round((soldPremiumCents * e.weight) / totalWeight)
        : Math.round(soldPremiumCents / entries.length),
    effectiveDate: e.effectiveDate,
  }));
  const drift = soldPremiumCents - rows.reduce((sum, r) => sum + r.premiumCents, 0);
  rows[0]!.premiumCents += drift;
  return rows;
}

/** Returns the number of policies_sold rows written. */
async function derivePolicies(agencyId: string, dbLead: Lead, leadQuotes: Quote[]): Promise<number> {
  if (!dbLead.soldDate || (dbLead.soldPremiumCents ?? 0) <= 0) {
    // Not (or no longer) sold: clear any previously derived rows.
    await prisma.policySold.deleteMany({ where: { agencyId, leadId: dbLead.id } });
    return 0;
  }

  const soldQuotes = leadQuotes.filter((q) => q.sold);
  const derived = apportionSoldPremium(dbLead.soldPremiumCents!, soldQuotes);
  for (const row of derived) {
    await prisma.policySold.upsert({
      where: { agencyId_leadId_productLine: { agencyId, leadId: dbLead.id, productLine: row.productLine } },
      create: {
        agencyId,
        leadId: dbLead.id,
        azProducerId: dbLead.azProducerId,
        productLine: row.productLine,
        premiumCents: row.premiumCents,
        soldDate: dbLead.soldDate,
        effectiveDate: row.effectiveDate,
      },
      update: {
        azProducerId: dbLead.azProducerId,
        premiumCents: row.premiumCents,
        soldDate: dbLead.soldDate,
        effectiveDate: row.effectiveDate,
      },
    });
  }
  // Stale lines (e.g. an earlier "unknown" row once quote detail arrives)
  // would double-count premium; the derivation is the source of truth.
  await prisma.policySold.deleteMany({
    where: { agencyId, leadId: dbLead.id, productLine: { notIn: derived.map((r) => r.productLine) } },
  });
  return derived.length;
}
