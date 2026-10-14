import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MASTERY,
  EVENTS_KEY,
  cleanTempo,
  createProgressLog,
  dailyCounts,
  memoryStore,
  statsByRef,
  streakDays,
  tierFor,
  type AttemptEvent,
} from './progress';

const at = (ts: string, over: Partial<AttemptEvent> = {}): AttemptEvent => ({
  v: 2, id: ts, ts, kind: 'theory', ref: 'intervals', ...over,
});

describe('the log', () => {
  it('appends and reads back', () => {
    const log = createProgressLog(memoryStore());
    log.record({ kind: 'theory', ref: 'intervals', correct: true, responseMs: 1200, tier: 1 });
    log.record({ kind: 'theory', ref: 'intervals', correct: false, responseMs: 3000, tier: 1 });
    const all = log.all();
    expect(all).toHaveLength(2);
    expect(all[0].v).toBe(2);
    expect(all[0].id).not.toBe(all[1].id);
    expect(all[0].ts).toBeTruthy();
  });

  it('survives corrupt storage rather than throwing', () => {
    const store = memoryStore();
    store.setItem(EVENTS_KEY, 'not json');
    const log = createProgressLog(store);
    expect(log.all()).toEqual([]);
    log.record({ kind: 'theory', ref: 'x' });
    expect(log.all()).toHaveLength(1);
  });

  it('clears', () => {
    const log = createProgressLog(memoryStore());
    log.record({ kind: 'theory', ref: 'x' });
    log.clear();
    expect(log.all()).toEqual([]);
  });
});

describe('backfill from the existing routine logs', () => {
  it('imports old practice without touching the originals', () => {
    const store = memoryStore();
    const original = JSON.stringify([
      { date: '2026-01-02T10:00:00.000Z', ms: 5000, bpm: 100 },
      { date: '2026-01-03T10:00:00.000Z', ms: 4000, bpm: 110 },
    ]);
    store.setItem('overture.practice.noteFinder.history', original);
    const log = createProgressLog(store);

    expect(log.backfillFromRoutineLogs()).toBe(2);
    const events = log.all();
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('routine');
    expect(events[0].ref).toBe('noteFinder');
    expect(events[1].bpm).toBe(110);
    // The original log is still exactly as it was.
    expect(store.getItem('overture.practice.noteFinder.history')).toBe(original);
  });

  it('only runs once', () => {
    const store = memoryStore();
    store.setItem('overture.practice.circle.history', JSON.stringify([{ date: '2026-01-01T00:00:00.000Z' }]));
    const log = createProgressLog(store);
    expect(log.backfillFromRoutineLogs()).toBe(1);
    expect(log.backfillFromRoutineLogs()).toBe(0);
    expect(log.all()).toHaveLength(1);
  });

  it('shrugs off a corrupt routine log', () => {
    const store = memoryStore();
    store.setItem('overture.practice.improv.history', '{{{');
    const log = createProgressLog(store);
    expect(() => log.backfillFromRoutineLogs()).not.toThrow();
  });
});

describe('aggregates', () => {
  const events: AttemptEvent[] = [
    at('2026-03-01T10:00:00.000Z', { correct: true, responseMs: 1000 }),
    at('2026-03-01T10:01:00.000Z', { correct: false, responseMs: 5000 }),
    at('2026-03-02T10:00:00.000Z', { correct: true, responseMs: 3000 }),
    at('2026-03-02T10:01:00.000Z', { ref: 'chords', correct: true, responseMs: 2000 }),
  ];

  it('counts accuracy and median response per topic', () => {
    const stats = statsByRef(events);
    const intervals = stats.get('intervals')!;
    expect(intervals.attempts).toBe(3);
    expect(intervals.correct).toBe(2);
    expect(intervals.accuracy).toBeCloseTo(2 / 3);
    expect(intervals.medianResponseMs).toBe(3000);
    expect(intervals.lastSeen).toBe('2026-03-02T10:00:00.000Z');
    expect(stats.get('chords')!.accuracy).toBe(1);
  });

  it('leaves accuracy null when nothing was graded', () => {
    const stats = statsByRef([at('2026-03-01T10:00:00.000Z', { correct: undefined })]);
    expect(stats.get('intervals')!.accuracy).toBeNull();
  });

  it('filters by kind', () => {
    const mixed = [...events, at('2026-03-03T10:00:00.000Z', { kind: 'technique', ref: 'alternate' })];
    expect([...statsByRef(mixed, 'technique').keys()]).toEqual(['alternate']);
  });

  it('reports the fastest clean tempo only', () => {
    const tech: AttemptEvent[] = [
      at('2026-03-01T10:00:00.000Z', { kind: 'technique', ref: 'alternate', bpm: 100, clean: true }),
      at('2026-03-02T10:00:00.000Z', { kind: 'technique', ref: 'alternate', bpm: 140, clean: false }),
      at('2026-03-03T10:00:00.000Z', { kind: 'technique', ref: 'alternate', bpm: 120, clean: true }),
    ];
    expect(cleanTempo(tech, 'alternate')).toBe(120);
    expect(cleanTempo(tech, 'legato')).toBeNull();
  });

  it('counts practice per day', () => {
    const counts = dailyCounts(events, 3, new Date('2026-03-02T23:00:00.000Z'));
    expect(counts.map((c) => c.count)).toEqual([0, 2, 2]);
    expect(counts[2].date).toBe('2026-03-02');
  });

  it('counts a streak back from today', () => {
    expect(streakDays(events, new Date('2026-03-02T23:00:00.000Z'))).toBe(2);
    // A gap yesterday ends the streak.
    expect(streakDays(events, new Date('2026-03-04T23:00:00.000Z'))).toBe(0);
  });
});

describe('mastery', () => {
  const run = (results: boolean[], tier = 1): AttemptEvent[] =>
    results.map((correct, i) => at(`2026-03-01T10:${String(i).padStart(2, '0')}:00.000Z`, { correct, tier }));

  it('starts everyone at tier 1', () => {
    expect(tierFor([], 'intervals').tier).toBe(1);
    expect(tierFor([], 'intervals').reason).toMatch(/Not practised yet/);
  });

  it('waits for a full window before judging', () => {
    const r = tierFor(run([true, true, true]), 'intervals');
    expect(r.tier).toBe(1);
    expect(r.reason).toMatch(/3 of 10/);
  });

  it('promotes on a strong window', () => {
    const r = tierFor(run([...Array(9).fill(true), false]), 'intervals');
    expect(r.tier).toBe(2);
    expect(r.reason).toMatch(/90%/);
  });

  it('holds in the middle', () => {
    const r = tierFor(run([...Array(7).fill(true), false, false, false]).slice(-10), 'intervals');
    expect(r.tier).toBe(1);
    expect(r.reason).toMatch(/staying/);
  });

  it('drops back on a weak window', () => {
    const r = tierFor(run([...Array(4).fill(true), ...Array(6).fill(false)], 3), 'intervals');
    expect(r.tier).toBe(2);
    expect(r.reason).toMatch(/dropping back/);
  });

  it('never goes below 1 or above the ceiling', () => {
    expect(tierFor(run(Array(10).fill(false), 1), 'intervals').tier).toBe(1);
    expect(tierFor(run(Array(10).fill(true), DEFAULT_MASTERY.maxTier), 'intervals').tier).toBe(DEFAULT_MASTERY.maxTier);
  });
});
