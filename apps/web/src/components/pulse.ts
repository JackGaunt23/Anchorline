"use client";

// KPI pulse after a sync: a window event bus keeps the sidebar sync buttons
// decoupled from the server-rendered KPI tiles.

import { useEffect, useState } from "react";

const EVENT = "anchorline:kpi-pulse";

export function pulseKpis(keys: string[]) {
  if (keys.length === 0) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: keys }));
}

/** True for ~1.4s after this KPI key is pulsed. */
export function useKpiPulse(key: string): boolean {
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onPulse = (e: Event) => {
      const keys = (e as CustomEvent<string[]>).detail;
      if (!keys?.includes(key)) return;
      setPulsing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setPulsing(false), 1400);
    };
    window.addEventListener(EVENT, onPulse);
    return () => {
      window.removeEventListener(EVENT, onPulse);
      clearTimeout(timer);
    };
  }, [key]);
  return pulsing;
}
