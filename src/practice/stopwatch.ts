/** Wall-clock stopwatch for timing practice runs. */
export class Stopwatch {
  private startedAt: number | null = null;
  private accumulated = 0;

  get running(): boolean {
    return this.startedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }

  /** Stop and return the elapsed milliseconds. */
  stop(): number {
    if (this.startedAt !== null) {
      this.accumulated += performance.now() - this.startedAt;
      this.startedAt = null;
    }
    return this.accumulated;
  }

  reset(): void {
    this.startedAt = null;
    this.accumulated = 0;
  }

  elapsed(): number {
    return this.accumulated + (this.startedAt === null ? 0 : performance.now() - this.startedAt);
  }
}

/** Format milliseconds as m:ss.t (e.g. 1:07.3). */
export function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}
