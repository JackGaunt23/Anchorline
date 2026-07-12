/**
 * Deterministic PRNG (mulberry32) — same algorithm the mockup used, so demo
 * data is reproducible for a given seed.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

/** Pick with weights (parallel arrays). */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/**
 * Distribute `total` into `n` non-negative integer parts whose spread follows
 * the provided per-part weights, summing exactly to `total`.
 */
export function distributeInt(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const parts = weights.map((w) => Math.floor((w / weightSum) * total));
  let remainder = total - parts.reduce((s, p) => s + p, 0);
  // Hand out the rounding remainder to the largest-weight parts first.
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.i);
  let k = 0;
  while (remainder > 0) {
    const idx = order[k % order.length];
    if (idx !== undefined) parts[idx] = (parts[idx] ?? 0) + 1;
    remainder--;
    k++;
  }
  return parts;
}
