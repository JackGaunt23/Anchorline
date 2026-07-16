import { prisma } from "@anchorline/db";
import {
  agencyDayRange,
  buildDailyCallReport,
  qualifyConversation,
  type ConversationSkipReason,
} from "@anchorline/metrics";
import { fmtPhone } from "@/lib/format";

const DAY_MS = 86_400_000;

interface ConversationRow {
  id: string;
  contact_name: string | null;
  counterparty_number: string | null;
  direction: string;
  start_time: Date;
  duration_seconds: number;
  rc_extension_id: string | null;
  last_prior: Date | null;
}

export interface NewConversation {
  id: string;
  contactLabel: string;
  direction: string;
  startTime: Date;
  durationSeconds: number;
  lastPriorContactAt: Date | null;
  producerName: string;
  qualifies: boolean;
  reason: ConversationSkipReason | null;
  daysSinceContact: number | null;
}

export async function getNewConversations(agencyId: string): Promise<NewConversation[]> {
  const from = new Date(Date.now() - 7 * DAY_MS);
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT c.id, c.contact_name, c.counterparty_number, c.direction, c.start_time,
           c.duration_seconds, c.rc_extension_id, prev.last_prior
    FROM calls c
    LEFT JOIN LATERAL (
      SELECT MAX(p.start_time) AS last_prior FROM calls p
      WHERE p.agency_id = c.agency_id
        AND p.counterparty_number = c.counterparty_number
        AND p.start_time < c.start_time
    ) prev ON true
    WHERE c.agency_id = ${agencyId} AND c.start_time >= ${from}
      AND c.counterparty_number IS NOT NULL
    ORDER BY c.start_time DESC`;

  const extensionIds = [...new Set(rows.flatMap((row) => (row.rc_extension_id ? [row.rc_extension_id] : [])))];
  const producers = extensionIds.length
    ? await prisma.producerIdentityMap.findMany({
        where: { agencyId, rcExtensionId: { in: extensionIds } },
        select: { rcExtensionId: true, displayName: true },
      })
    : [];
  const producerByExtension = new Map(producers.map((producer) => [producer.rcExtensionId, producer.displayName]));

  const conversations = rows.map((row) => {
    const qualification = qualifyConversation({
      durationSeconds: row.duration_seconds,
      callStart: row.start_time,
      lastPriorContactAt: row.last_prior,
    });
    return {
      id: row.id,
      contactLabel: row.contact_name ?? fmtPhone(row.counterparty_number!),
      direction: row.direction,
      startTime: row.start_time,
      durationSeconds: row.duration_seconds,
      lastPriorContactAt: row.last_prior,
      producerName: producerByExtension.get(row.rc_extension_id) ?? "Unmapped",
      ...qualification,
    };
  });

  const qualifying = conversations.filter((conversation) => conversation.qualifies).slice(0, 18);
  const contactedRecently = conversations
    .filter((conversation) => conversation.reason === "contacted_recently")
    .slice(0, 3);
  const underTenMinutes = conversations
    .filter((conversation) => conversation.reason === "under_10_min")
    .slice(0, 9 - contactedRecently.length);
  const skipped = [...contactedRecently, ...underTenMinutes].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
  return [...qualifying, ...skipped];
}

interface DailyCallRow {
  direction: string;
  result: string | null;
  n: number;
}

export async function getDailyCallReport(agencyId: string, timezone: string) {
  const range = agencyDayRange(timezone);
  const rows = await prisma.$queryRaw<DailyCallRow[]>`
    SELECT direction, result, COUNT(*)::int AS n
    FROM calls
    WHERE agency_id = ${agencyId} AND start_time >= ${range.from} AND start_time < ${range.to}
    GROUP BY 1, 2`;
  const calls = rows.flatMap((row) =>
    Array.from({ length: row.n }, () => ({ direction: row.direction, result: row.result })),
  );
  return buildDailyCallReport(calls);
}
