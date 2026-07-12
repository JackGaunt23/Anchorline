// Small shared building blocks (usable from server and client components).

export function Panel({
  children,
  className = "",
  ...rest
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-card p-[18px] pb-4 shadow-card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function PanelHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-bold">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const AVATAR_SIZES = {
  sm: "h-8 w-8 text-[11.5px]",
  lg: "h-11 w-11 text-[15px]",
} as const;

export function Avatar({ initials, size = "sm" }: { initials: string; size?: keyof typeof AVATAR_SIZES }) {
  return (
    <span className={`flex flex-none items-center justify-center rounded-full bg-teal-soft font-bold text-teal ${AVATAR_SIZES[size]}`}>
      {initials}
    </span>
  );
}

export const SIGNAL_TONE_CLASSES: Record<string, string> = {
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  neutral: "bg-sunken text-ink-secondary",
  ramping: "bg-sunken text-good border border-[color-mix(in_srgb,var(--good)_35%,transparent)]",
};

export function SignalPill({ label, tone, icon }: { label: string; tone: string; icon?: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-1 text-[11px] font-bold ${
        SIGNAL_TONE_CLASSES[tone] ?? SIGNAL_TONE_CLASSES.neutral
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
