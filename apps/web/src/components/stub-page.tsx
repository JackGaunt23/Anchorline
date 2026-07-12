// Styled placeholder for nav destinations that land in later phases.

import { Panel } from "./ui";

export function StubPage({ title, description, phase }: { title: string; description: string; phase: string }) {
  return (
    <main className="flex max-w-[720px] flex-col gap-[22px] px-7 pb-12 pt-[22px]">
      <Panel className="items-start">
        <h2 className="font-display text-[19px] font-semibold">{title}</h2>
        <p className="text-[13px] leading-relaxed text-ink-secondary">{description}</p>
        <span className="rounded-full bg-sunken px-3 py-1.5 text-[11.5px] font-semibold text-ink-muted">{phase}</span>
      </Panel>
    </main>
  );
}
