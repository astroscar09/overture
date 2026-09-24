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
 * Deals items in a shuffled order and refills itself once empty, so a drill can
 * run for as long as you like while still covering the whole pool evenly. The
 * item just dealt never comes straight back on the next draw, so you are never
 * asked the same thing twice in a row.
 */
export class ShuffleBag<T> {
  private items: T[] = [];
  private remaining: T[] = [];
  private lastKey: string | null = null;
  private keyOf: (item: T) => string;

  constructor(items: T[], keyOf: (item: T) => string = (item) => String(item)) {
    this.keyOf = keyOf;
    this.setItems(items);
  }

  /** Replace the pool. The next draw starts a fresh shuffle. */
  setItems(items: T[]): void {
    this.items = items.slice();
    this.remaining = [];
  }

  get size(): number {
    return this.items.length;
  }

  /** Draw the next item, or null when the pool is empty. */
  next(): T | null {
    if (this.items.length === 0) return null;
    if (this.remaining.length === 0) this.remaining = shuffled(this.items);
    // A refilled bag can open with the item that closed the last one: push that
    // one further back so nothing repeats across the seam.
    const top = this.remaining.length - 1;
    if (top > 0 && this.keyOf(this.remaining[top]) === this.lastKey) {
      const j = Math.floor(Math.random() * top);
      [this.remaining[top], this.remaining[j]] = [this.remaining[j], this.remaining[top]];
    }
    const item = this.remaining.pop() as T;
    this.lastKey = this.keyOf(item);
    return item;
  }

  /** Forget the deal order and the last item drawn (a drill starting over). */
  reset(): void {
    this.remaining = [];
    this.lastKey = null;
  }
}
