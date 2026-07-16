export const NEW_CONV_MIN_SECONDS = 600;
export const NEW_CONV_LOOKBACK_DAYS = 30;

const DAY_MS = 86_400_000;

export type ConversationSkipReason = "under_10_min" | "contacted_recently";

export function qualifyConversation(input: {
  durationSeconds: number;
  callStart: Date;
  lastPriorContactAt: Date | null;
}): {
  qualifies: boolean;
  reason: ConversationSkipReason | null;
  daysSinceContact: number | null;
} {
  const daysSinceContact = input.lastPriorContactAt
    ? Math.floor((input.callStart.getTime() - input.lastPriorContactAt.getTime()) / DAY_MS)
    : null;

  if (input.durationSeconds <= NEW_CONV_MIN_SECONDS) {
    return { qualifies: false, reason: "under_10_min", daysSinceContact };
  }
  if (daysSinceContact !== null && daysSinceContact <= NEW_CONV_LOOKBACK_DAYS) {
    return { qualifies: false, reason: "contacted_recently", daysSinceContact };
  }
  return { qualifies: true, reason: null, daysSinceContact };
}

export type CallResultClass = "connected" | "voicemail" | "no_answer";

/** Provisional until verified against live data (GO-LIVE.md §3 switch point). */
export function classifyCallResult(result: string | null): CallResultClass {
  if (result === "Call connected" || result === "Accepted") return "connected";
  if (result === "Voicemail" || result === "Reply") return "voicemail";
  return "no_answer";
}

export function buildDailyCallReport(
  calls: { direction: string; result: string | null }[],
): {
  inbound: number;
  outboundConnected: number;
  outboundVoicemail: number;
  outboundNoAnswer: number;
  outboundTotal: number;
  total: number;
  connectRatePct: number;
} {
  let inbound = 0;
  let outboundConnected = 0;
  let outboundVoicemail = 0;
  let outboundNoAnswer = 0;

  for (const call of calls) {
    if (call.direction === "Inbound") {
      inbound += 1;
      continue;
    }
    const result = classifyCallResult(call.result);
    if (result === "connected") outboundConnected += 1;
    else if (result === "voicemail") outboundVoicemail += 1;
    else outboundNoAnswer += 1;
  }

  const outboundTotal = outboundConnected + outboundVoicemail + outboundNoAnswer;
  return {
    inbound,
    outboundConnected,
    outboundVoicemail,
    outboundNoAnswer,
    outboundTotal,
    total: inbound + outboundTotal,
    connectRatePct:
      outboundTotal === 0 ? 0 : Math.round((outboundConnected / outboundTotal) * 1000) / 10,
  };
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** Convert a local midnight in an IANA zone to its UTC instant. */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  // Offset iteration also handles zones whose UTC offset changes near this day.
  for (let i = 0; i < 4; i++) {
    const shown = localParts(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const adjustment = target - shownAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

/** UTC instants bounding today in the agency's IANA timezone. */
export function agencyDayRange(timezone: string, now = new Date()): { from: Date; to: Date } {
  const local = localParts(now, timezone);
  const from = localMidnightUtc(local.year, local.month, local.day, timezone);
  const nextLocalDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const to = localMidnightUtc(
    nextLocalDay.getUTCFullYear(),
    nextLocalDay.getUTCMonth() + 1,
    nextLocalDay.getUTCDate(),
    timezone,
  );
  return { from, to };
}
