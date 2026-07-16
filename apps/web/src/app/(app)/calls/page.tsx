import { isDemoMode } from "@anchorline/providers";
import { CallReport } from "@/components/calls/call-report";
import { ConversationsPanel, type ConversationView } from "@/components/calls/conversations-panel";
import { getAgency } from "@/lib/data/agency";
import { getDailyCallReport, getNewConversations } from "@/lib/data/calls";

export default async function CallsPage() {
  const agency = await getAgency();
  const now = new Date();
  const [conversations, report] = await Promise.all([
    getNewConversations(agency.id),
    getDailyCallReport(agency.id, agency.timezone),
  ]);
  const views: ConversationView[] = conversations.map((call) => ({
    id: call.id,
    contactLabel: call.contactLabel,
    startTimeIso: call.startTime.toISOString(),
    durationSeconds: call.durationSeconds,
    lastPriorContactAtIso: call.lastPriorContactAt?.toISOString() ?? null,
    producerName: call.producerName,
    qualifies: call.qualifies,
    reason: call.reason,
    daysSinceContact: call.daysSinceContact,
  }));

  return (
    <main className="flex max-w-[1360px] flex-col gap-[22px] px-7 pb-12 pt-[22px]">
      <ConversationsPanel conversations={views} timezone={agency.timezone} nowIso={now.toISOString()} />
      <CallReport report={report} subtitle={`Today · ${isDemoMode() ? "sample data" : agency.name}`} />
      {isDemoMode() && (
        <p className="pb-1 pt-1.5 text-center text-[11.5px] text-ink-muted">
          All figures on this page are synthetic sample data for demonstration purposes.
        </p>
      )}
    </main>
  );
}
