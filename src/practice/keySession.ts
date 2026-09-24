import type { PitchClass } from '../music/notes';

export const KEY_COUNT = 12;

/** Fisher–Yates shuffle (returns a new array). */
function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One pass through all 12 keys in a random order. Slots 1–12 map to the
 * shuffled keys; each is revealed only when the previous one has a time.
 */
export class KeySession {
  id = 0;
  order: PitchClass[] = [];
  /** Index of the revealed (current) slot; -1 before the first reveal. */
  index = -1;
  times: (number | null)[] = [];
  bpms: (number | null)[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.id = Date.now();
    this.order = shuffled(Array.from({ length: KEY_COUNT }, (_, pc) => pc));
    this.index = -1;
    this.times = Array(KEY_COUNT).fill(null);
    this.bpms = Array(KEY_COUNT).fill(null);
  }

  /** The current key's pitch class, or null before the first reveal. */
  get current(): PitchClass | null {
    return this.index >= 0 ? this.order[this.index] : null;
  }

  canReveal(): boolean {
    if (this.index < 0) return true;
    return this.index < KEY_COUNT - 1 && this.times[this.index] !== null;
  }

  reveal(): boolean {
    if (!this.canReveal()) return false;
    this.index++;
    return true;
  }

  /** Record (or overwrite) the time for the current key. */
  record(ms: number, bpm: number): void {
    if (this.index < 0) return;
    this.times[this.index] = ms;
    this.bpms[this.index] = bpm;
  }

  get isComplete(): boolean {
    return this.times.every((t) => t !== null);
  }

  total(): number {
    return this.times.reduce<number>((sum, t) => sum + (t ?? 0), 0);
  }
}
