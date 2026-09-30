/** Fisher–Yates shuffle (returns a new array). */
export function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks prompts for a drill that runs indefinitely.
 *
 * Every item except the one just drawn can come up on any draw, so the drill
 * never feels like it is working through a list — but the longer an item has
 * been away the likelier it is, so a handful of notes cannot hog the session
 * while others go missing. An item is weighted by how many draws ago it was
 * last seen (never seen at all counts as the longest), and the item just drawn
 * is weighted zero, so nothing ever repeats back to back.
 *
 * The history survives `setItems`, stopping and starting: pressing Start always
 * hands you something other than the note you just finished with.
 */
export class RecencyPicker<T> {
  private items: T[] = [];
  private keyOf: (item: T) => string;
  /** Keys drawn so far, newest first, capped at the pool size. */
  private history: string[] = [];

  constructor(items: T[], keyOf: (item: T) => string = (item) => String(item)) {
    this.keyOf = keyOf;
    this.setItems(items);
  }

  /** Replace the pool, keeping the history of anything still in it. */
  setItems(items: T[]): void {
    this.items = items.slice();
    const pool = new Set(this.items.map((item) => this.keyOf(item)));
    this.history = this.history.filter((key) => pool.has(key)).slice(0, this.items.length);
  }

  get size(): number {
    return this.items.length;
  }

  /** The key of the item drawn last, or null before the first draw. */
  get lastKey(): string | null {
    return this.history[0] ?? null;
  }

  /** Draw the next item, or null when the pool is empty. */
  next(): T | null {
    if (this.items.length === 0) return null;
    const n = this.items.length;
    const weights = this.items.map((item) => {
      const seenAgo = this.history.indexOf(this.keyOf(item));
      if (seenAgo === 0) return 0; // just drawn: never twice in a row
      return seenAgo === -1 ? n : seenAgo; // unseen is likeliest, then longest-ago
    });
    const total = weights.reduce((a, b) => a + b, 0);
    // A one-item pool (or a pool of one after the exclusion) has nowhere else to go.
    let index = 0;
    if (total > 0) {
      let r = Math.random() * total;
      for (let i = 0; i < n; i++) {
        r -= weights[i];
        if (r < 0) {
          index = i;
          break;
        }
      }
    }
    const item = this.items[index];
    this.history = [this.keyOf(item), ...this.history.filter((k) => k !== this.keyOf(item))].slice(0, n);
    return item;
  }

  /** Forget what has been drawn (the pool changed completely). */
  reset(): void {
    this.history = [];
  }
}
