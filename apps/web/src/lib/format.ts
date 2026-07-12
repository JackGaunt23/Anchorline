// Number/date formatters matching the mockup's rendering exactly.

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

export const fmtCurrency = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);

export const fmtCurrencyCompact = (dollars: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);

export const fmtPct = (n: number, digits = 1) => n.toFixed(digits) + "%";

/** Talk time: 10,870 minutes → "181h 10m". */
export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

/** Call duration: 252 seconds → "4:12". */
export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A UTC day key ("2026-07-08") → "Jul 8" (chart axes; buckets are UTC days). */
export function fmtDayKey(dayKey: string) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** A UTC day key → "Wed, Jul 8" (tooltips, call cards). */
export function fmtDayKeyLong(dayKey: string) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Instant → "Wed, Jul 8" in the agency timezone. */
export function fmtDateShort(at: Date | string, timeZone: string) {
  return new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
}

/** Instant → "6:58 AM" in the agency timezone. */
export function fmtTime(at: Date | string, timeZone: string) {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/** Instant → "Jul 8, 6:58 AM" in the agency timezone. */
export function fmtDateTime(at: Date | string, timeZone: string) {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** Instant → "Sunday, July 12, 2026" in the agency timezone (topbar). */
export function fmtToday(at: Date, timeZone: string) {
  return at.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}
