// Progress tracking: one append-only log of attempts, and aggregates derived
// from it on read.
//
// Nothing is stored pre-summarised. An attempt is a fact ("on this date, at
// this tier, this answer took 2.4s and was right"); accuracy, clean tempos,
// streaks and mastery are all computed from those facts, so the way progress
// is measured can change later without invalidating what was recorded.
//
// The per-routine logs in history.ts are left exactly as they are. This log
// sits alongside them and backfills from them once, so no practice is lost.

import { LOG_KEYS } from './history';

export type AttemptKind = 'theory' | 'technique' | 'ear' | 'routine';

export interface AttemptEvent {
  /** Schema version of this record. */
  v: 2;
  id: string;
  /** ISO timestamp. */
  ts: string;
  kind: AttemptKind;
  /** What was practised: a topic id, an exercise id, or a routine id. */
  ref: string;
  tier?: number;
  correct?: boolean;
  responseMs?: number;
  bpm?: number;
  /** Completed without stopping — how clean technique tempos are earned. */
  clean?: boolean;
  /** The seed that generated the exercise, so it can be rebuilt exactly. */
  seed?: number;
}

export const EVENTS_KEY = 'overture.progress.events';
const BACKFILL_KEY = 'overture.progress.backfilled';
/** Events kept. At a few hundred a day this is years of practice. */
const EVENT_LIMIT = 20000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory stand-in, used in tests and when storage is unavailable. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function defaultStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(EVENTS_KEY);
      return localStorage;
    }
  } catch {
    // Private mode, blocked site data: fall through to memory.
  }
  return memoryStore();
}

export interface ProgressLog {
  record(event: Omit<AttemptEvent, 'v' | 'id' | 'ts'> & { ts?: string }): AttemptEvent;
  all(): AttemptEvent[];
  clear(): void;
  backfillFromRoutineLogs(): number;
}

export function createProgressLog(store: KeyValueStore = defaultStore()): ProgressLog {
  const read = (): AttemptEvent[] => {
    try {
      const parsed: unknown = JSON.parse(store.getItem(EVENTS_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as AttemptEvent[]) : [];
    } catch {
      return [];
    }
  };
  const write = (events: AttemptEvent[]): void => {
    try {
      store.setItem(EVENTS_KEY, JSON.stringify(events.slice(-EVENT_LIMIT)));
    } catch {
      // Out of quota or unavailable: the session still works, it just won't persist.
    }
  };

  let counter = 0;
  const nextId = (ts: string): string => `${ts}-${(counter++).toString(36)}`;

  return {
    record(event) {
      const ts = event.ts ?? new Date().toISOString();
      const full: AttemptEvent = { ...event, v: 2, id: nextId(ts), ts };
      write([...read(), full]);
      return full;
    },
    all: read,
    clear() {
      try {
        store.removeItem(EVENTS_KEY);
      } catch {
        // Nothing stored means nothing to clear.
      }
    },
    /**
     * Fold the existing per-routine histories into the event log, once. The
     * originals are left untouched.
     */
    backfillFromRoutineLogs(): number {
      if (store.getItem(BACKFILL_KEY)) return 0;
      const added: AttemptEvent[] = [];
      for (const [name, key] of Object.entries(LOG_KEYS)) {
        let rows: unknown;
        try {
          rows = JSON.parse(store.getItem(key) ?? '[]');
        } catch {
          continue;
        }
        if (!Array.isArray(rows)) continue;
        for (const row of rows as Record<string, unknown>[]) {
          const ts = typeof row.date === 'string' ? row.date : new Date(0).toISOString();
          added.push({
            v: 2,
            id: nextId(ts),
            ts,
            kind: 'routine',
            ref: name,
            bpm: typeof row.bpm === 'number' ? row.bpm : undefined,
            responseMs: typeof row.ms === 'number' ? row.ms : undefined,
          });
        }
      }
      if (added.length) {
        const merged = [...read(), ...added].sort((a, b) => a.ts.localeCompare(b.ts));
        write(merged);
      }
      try {
        store.setItem(BACKFILL_KEY, new Date().toISOString());
      } catch {
        // If we cannot mark it, the worst case is backfilling again next load.
      }
      return added.length;
    },
  };
}

// ---- Days ----
//
// A practice day is a *local* day. Bucketing by the UTC date in the timestamp
// looks right until someone practises at 10am and checks their progress at
// 7pm west of Greenwich: those two moments fall on different UTC dates, and
// the streak they are looking at breaks for no reason they can see.

/** YYYY-MM-DD in the viewer's own timezone. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local day an event happened on. */
export const dayOf = (event: { ts: string }): string => localDay(new Date(event.ts));

// ---- Aggregates (pure: they take events, they do not read storage) ----

export interface RefStats {
  ref: string;
  attempts: number;
  correct: number;
  /** 0–1, or null when nothing was graded. */
  accuracy: number | null;
  medianResponseMs: number | null;
  lastSeen: string | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function statsByRef(events: readonly AttemptEvent[], kind?: AttemptKind): Map<string, RefStats> {
  const out = new Map<string, RefStats>();
  const times = new Map<string, number[]>();
  for (const e of events) {
    if (kind && e.kind !== kind) continue;
    const s = out.get(e.ref) ?? { ref: e.ref, attempts: 0, correct: 0, accuracy: null, medianResponseMs: null, lastSeen: null };
    s.attempts += 1;
    if (e.correct === true) s.correct += 1;
    if (!s.lastSeen || e.ts > s.lastSeen) s.lastSeen = e.ts;
    out.set(e.ref, s);
    if (typeof e.responseMs === 'number') {
      times.set(e.ref, [...(times.get(e.ref) ?? []), e.responseMs]);
    }
  }
  for (const [ref, s] of out) {
    const graded = events.filter((e) => e.ref === ref && typeof e.correct === 'boolean').length;
    s.accuracy = graded ? s.correct / graded : null;
    s.medianResponseMs = median(times.get(ref) ?? []);
  }
  return out;
}

/** The fastest tempo a technique has been played cleanly. */
export function cleanTempo(events: readonly AttemptEvent[], ref: string): number | null {
  const tempos = events.filter((e) => e.ref === ref && e.clean === true && typeof e.bpm === 'number').map((e) => e.bpm as number);
  return tempos.length ? Math.max(...tempos) : null;
}

/** Attempts per day, most recent last, covering the last `days` days. */
export function dailyCounts(events: readonly AttemptEvent[], days: number, today = new Date()): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = localDay(d);
    out.push({ date, count: events.filter((e) => dayOf(e) === date).length });
  }
  return out;
}

/** Consecutive days practised, counting back from today. */
export function streakDays(events: readonly AttemptEvent[], today = new Date()): number {
  const days = new Set(events.map(dayOf));
  let streak = 0;
  const cursor = new Date(today);
  while (days.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface MasteryOptions {
  /** How many recent attempts the decision looks at. */
  window: number;
  /** Accuracy needed to move up. */
  promoteAbove: number;
  /** Accuracy below which it drops back. */
  demoteBelow: number;
  maxTier: number;
}

export const DEFAULT_MASTERY: MasteryOptions = {
  window: 10,
  promoteAbove: 0.85,
  demoteBelow: 0.6,
  maxTier: 5,
};

/**
 * The tier a topic should be offered at next. Deliberately a plain, inspectable
 * rule — a learner can be told exactly why the level moved.
 */
export function tierFor(
  events: readonly AttemptEvent[],
  ref: string,
  opts: MasteryOptions = DEFAULT_MASTERY,
): { tier: number; reason: string } {
  const graded = events.filter((e) => e.ref === ref && typeof e.correct === 'boolean');
  if (!graded.length) return { tier: 1, reason: 'Not practised yet — starting at tier 1.' };

  const current = graded[graded.length - 1].tier ?? 1;
  const recent = graded.slice(-opts.window);
  if (recent.length < opts.window) {
    return { tier: current, reason: `${recent.length} of ${opts.window} attempts at this tier so far.` };
  }
  const accuracy = recent.filter((e) => e.correct).length / recent.length;
  const pct = Math.round(accuracy * 100);
  if (accuracy >= opts.promoteAbove && current < opts.maxTier) {
    return { tier: current + 1, reason: `${pct}% over the last ${opts.window} — moving up to tier ${current + 1}.` };
  }
  if (accuracy < opts.demoteBelow && current > 1) {
    return { tier: current - 1, reason: `${pct}% over the last ${opts.window} — dropping back to tier ${current - 1}.` };
  }
  return { tier: current, reason: `${pct}% over the last ${opts.window} — staying at tier ${current}.` };
}
