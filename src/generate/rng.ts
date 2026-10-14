// Seeded pseudo-randomness for exercise generation.
//
// Everything the generators do is driven through one of these, so an exercise
// is reproducible from its seed alone: the same spec and seed always build the
// same phrase. That is what makes generated material testable, shareable and
// replayable from a practice log, and it is why no generator is ever allowed to
// call Math.random directly.

/** Returns a float in [0, 1), like Math.random but deterministic. */
export type Rng = () => number;

/**
 * mulberry32: small, fast, and good enough for musical choice-making. Not for
 * cryptography — only for deciding which note comes next.
 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new exercise. Record it: it is the exercise's identity. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Integer in [min, max], inclusive at both ends. */
export function int(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error(`int: empty range ${min}..${max}`);
  return min + Math.floor(rng() * (max - min + 1));
}

/** One item, uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[int(rng, 0, items.length - 1)];
}

/** One item, with relative weights. Zero-weight items are never chosen. */
export function weighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) throw new Error('weighted: no positive weights');
  let r = rng() * total;
  for (const { item, weight } of items) {
    r -= Math.max(0, weight);
    if (r < 0) return item;
  }
  return items[items.length - 1].item;
}

/** Fisher–Yates against the seeded stream (returns a new array). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `count` distinct items, or everything if the pool is smaller. */
export function sample<T>(rng: Rng, items: readonly T[], count: number): T[] {
  return shuffle(rng, items).slice(0, Math.min(count, items.length));
}

/** True with probability `p`. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
