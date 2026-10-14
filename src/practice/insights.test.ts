import { describe, expect, it } from 'vitest';
import type { AttemptEvent, AttemptKind } from './progress';
import { streakDays } from './progress';
import {
  DEFAULT_GOAL,
  cleanTempos,
  labelFor,
  reviewQueue,
  totals,
  trendByDay,
  trendByWeek,
  weekProgress,
  weekStart,
} from './insights';

// Days are bucketed in the viewer's own timezone, so the fixtures are built
// from local dates rather than UTC strings — otherwise these tests would pass
// in London and fail in California.
const local = (y: number, m: number, d: number, h = 10, min = 0): string =>
  new Date(y, m - 1, d, h, min, 0, 0).toISOString();

const at = (ts: string, over: Partial<AttemptEvent> = {}): AttemptEvent => ({
  v: 2, id: ts + Math.random(), ts, kind: 'theory', ref: 'intervals', ...over,
});

const streakFromSameDay = (event: AttemptEvent, now: Date): number => streakDays([event], now);

describe('labels', () => {
  it('prefers a known topic title', () => {
    expect(labelFor('intervals', [{ id: 'intervals', title: 'Intervals' }])).toBe('Intervals');
  });

  it('names a technique from its ref', () => {
    expect(labelFor('technique:alternate')).toBe('Alternate picking');
    expect(labelFor('technique:gallop')).toBe('Gallops');
  });

  it('names the practice routines', () => {
    expect(labelFor('3nps')).toBe('3NPS positions');
    expect(labelFor('circle')).toBe('Circle of fifths');
  });

  it('falls back to the raw ref rather than showing nothing', () => {
    expect(labelFor('something-new')).toBe('something-new');
  });
});

describe('week boundaries', () => {
  it('starts weeks on Monday', () => {
    // 2026-03-04 is a Wednesday.
    expect(weekStart(new Date(2026, 2, 4, 12))).toBe('2026-03-02');
    // Monday itself, at the very start of the day.
    expect(weekStart(new Date(2026, 2, 2, 0, 0))).toBe('2026-03-02');
    // Sunday night still belongs to the week that began the Monday before.
    expect(weekStart(new Date(2026, 2, 8, 23, 59))).toBe('2026-03-02');
    // The next Monday starts a new week.
    expect(weekStart(new Date(2026, 2, 9, 0, 0))).toBe('2026-03-09');
  });

  it('keeps a morning session and an evening check on the same day', () => {
    // The bug this guards: west of Greenwich, 10am and 7pm on the same local
    // day fall on two different UTC dates, which used to break the streak.
    const morning = at(local(2026, 3, 4, 10));
    const evening = new Date(2026, 2, 4, 19);
    expect(streakFromSameDay(morning, evening)).toBe(1);
  });
});

describe('trends', () => {
  const events = [
    at(local(2026, 3, 2, 10, 0), { correct: true, responseMs: 1000 }),
    at(local(2026, 3, 2, 10, 1), { correct: false, responseMs: 3000 }),
    at(local(2026, 3, 4, 10, 0), { correct: true, responseMs: 2000 }),
    at(local(2026, 3, 4, 10, 1), { correct: true, responseMs: 2000 }),
    at(local(2026, 3, 10, 10, 0), { correct: true, responseMs: 900 }),
  ];
  const today = new Date(2026, 2, 10, 20);

  it('gives one point per day, including empty ones', () => {
    const t = trendByDay(events, 10, today);
    expect(t).toHaveLength(10);
    expect(t[t.length - 1].period).toBe('2026-03-10');
    // 2026-03-02 had two, 03-04 had two, 03-10 had one, the rest nothing.
    expect(t.map((p) => p.attempts)).toEqual([0, 2, 0, 2, 0, 0, 0, 0, 0, 1]);
  });

  it('computes accuracy and median response per day', () => {
    const day = trendByDay(events, 10, today).find((p) => p.period === '2026-03-02')!;
    expect(day.attempts).toBe(2);
    expect(day.accuracy).toBe(0.5);
    expect(day.medianResponseMs).toBe(2000);
  });

  it('leaves accuracy null on a day with nothing graded', () => {
    const t = trendByDay([at(local(2026, 3, 10, 10))], 2, today);
    expect(t[1].attempts).toBe(1);
    expect(t[1].accuracy).toBeNull();
  });

  it('buckets by calendar week', () => {
    const t = trendByWeek(events, 3, today);
    expect(t.map((p) => p.period)).toEqual(['2026-02-23', '2026-03-02', '2026-03-09']);
    expect(t.map((p) => p.attempts)).toEqual([0, 4, 1]);
    expect(t[1].accuracy).toBe(0.75);
  });

  it('can be narrowed to one kind', () => {
    const mixed = [...events, at(local(2026, 3, 10, 11), { kind: 'ear', ref: 'ear-intervals', correct: false })];
    expect(trendByDay(mixed, 1, today)[0].attempts).toBe(2);
    expect(trendByDay(mixed, 1, today, 'ear')[0].attempts).toBe(1);
  });
});

describe('the weekly goal', () => {
  const today = new Date(2026, 2, 5, 20); // Thursday

  it('counts only this week', () => {
    const events = [
      at(local(2026, 2, 27, 10)), // last week
      at(local(2026, 3, 2, 10, 0)),
      at(local(2026, 3, 2, 10, 1)),
      at(local(2026, 3, 5, 10)),
    ];
    const p = weekProgress(events, { attempts: 10, days: 2 }, today);
    expect(p.weekOf).toBe('2026-03-02');
    expect(p.attempts.done).toBe(3);
    expect(p.days.done).toBe(2);
  });

  it('needs both halves to count as met', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(local(2026, 3, 5, 10, i)));
    const p = weekProgress(many, { attempts: 10, days: 3 }, today);
    expect(p.attempts.met).toBe(true);
    expect(p.days.met).toBe(false);
    expect(p.met).toBe(false);
  });

  it('is met when both are', () => {
    const spread = [2, 3, 4].flatMap((d) => Array.from({ length: 4 }, (_, i) => at(local(2026, 3, d, 10, i))));
    const p = weekProgress(spread, { attempts: 10, days: 3 }, today);
    expect(p.met).toBe(true);
  });

  it('has a sensible default', () => {
    expect(DEFAULT_GOAL.attempts).toBeGreaterThan(0);
    expect(DEFAULT_GOAL.days).toBeGreaterThan(0);
    expect(DEFAULT_GOAL.days).toBeLessThanOrEqual(7);
  });
});

describe('clean tempos', () => {
  it('reports best and latest separately, because they differ', () => {
    const events = [
      at(local(2026, 3, 1, 10), { kind: 'technique', ref: 'technique:alternate', bpm: 100, clean: true }),
      at(local(2026, 3, 2, 10), { kind: 'technique', ref: 'technique:alternate', bpm: 140, clean: true }),
      at(local(2026, 3, 3, 10), { kind: 'technique', ref: 'technique:alternate', bpm: 120, clean: true }),
      at(local(2026, 3, 3, 11), { kind: 'technique', ref: 'technique:alternate', bpm: 200, clean: false }),
    ];
    const row = cleanTempos(events).find((r) => r.ref === 'technique:alternate')!;
    expect(row.best).toBe(140);
    expect(row.latest).toBe(120);
    expect(row.runs).toBe(3);
  });

  it('lists every technique, even the untouched ones', () => {
    const rows = cleanTempos([]);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.best === null && r.runs === 0)).toBe(true);
  });
});

describe('the review queue', () => {
  const known = [
    { id: 'weak', title: 'Weak topic', kind: 'theory' as AttemptKind },
    { id: 'strong', title: 'Strong topic', kind: 'theory' as AttemptKind },
    { id: 'stale', title: 'Stale topic', kind: 'theory' as AttemptKind },
    { id: 'fresh', title: 'Fresh topic', kind: 'theory' as AttemptKind },
  ];
  const today = new Date(2026, 2, 20, 12);
  const run = (ref: string, m: number, d: number, results: boolean[]) =>
    results.map((correct, i) => at(local(2026, m, d, 10, i), { ref, correct }));

  const events = [
    ...run('weak', 3, 19, [false, false, false, true]),
    ...run('strong', 3, 19, [true, true, true, true]),
    ...run('stale', 2, 20, [true, true, true, false]),
    ...run('fresh', 3, 20, [true, true, false, true]),
  ];

  it('puts the weakest first', () => {
    const q = reviewQueue(events, known, today);
    expect(q[0].ref).toBe('weak');
    expect(q[0].accuracy).toBe(0.25);
  });

  it('ranks a strong but stale topic above a strong fresh one', () => {
    const q = reviewQueue(events, known, today);
    const at_ = (ref: string) => q.findIndex((i) => i.ref === ref);
    expect(at_('stale')).toBeLessThan(at_('strong'));
  });

  it('explains why each one is on the list', () => {
    const q = reviewQueue(events, known, today);
    expect(q.find((i) => i.ref === 'weak')!.reason).toMatch(/25% over 4 attempts/);
    expect(q.find((i) => i.ref === 'stale')!.reason).toMatch(/last seen 28 days ago/);
    expect(q.find((i) => i.ref === 'fresh')!.reason).toMatch(/practised today/);
  });

  it('includes topics never touched, but does not put them above active problems', () => {
    const q = reviewQueue(events, [...known, { id: 'new', title: 'New topic', kind: 'theory' }], today);
    const newItem = q.find((i) => i.ref === 'new')!;
    expect(newItem.reason).toBe('Not started yet.');
    expect(newItem.attempts).toBe(0);
    // An untried topic is a suggestion; something you are actively failing is
    // a problem, and problems come first.
    expect(q.findIndex((i) => i.ref === 'weak')).toBeLessThan(q.findIndex((i) => i.ref === 'new'));
    expect(q.findIndex((i) => i.ref === 'strong')).toBeGreaterThan(q.findIndex((i) => i.ref === 'new'));
  });

  it('caps staleness so a topic abandoned a year ago does not swamp everything', () => {
    const ancient = run('stale', 1, 1, [true, true, true, true]);
    const q = reviewQueue([...run('weak', 3, 19, [false, false, false, false]), ...ancient], known, today);
    expect(q[0].ref).toBe('weak');
  });

  it('ranks unscored practice by how long it has been, not by a made-up score', () => {
    // Technique runs carry no right/wrong, so only staleness should move them.
    const tech = [
      at(local(2026, 3, 19, 10), { kind: 'technique', ref: 'tech', bpm: 100, clean: true }),
    ];
    const q = reviewQueue(
      [...events, ...tech],
      [...known, { id: 'tech', title: 'A technique', kind: 'technique' }],
      today,
    );
    const item = q.find((i) => i.ref === 'tech')!;
    expect(item.accuracy).toBeNull();
    expect(item.reason).toMatch(/1 run, not scored/);
    // A topic genuinely at 25% outranks a technique practised a day ago.
    expect(q.findIndex((i) => i.ref === 'weak')).toBeLessThan(q.findIndex((i) => i.ref === 'tech'));
  });

  it('is stable: equal priorities fall back to the name', () => {
    const q = reviewQueue([], known, today);
    expect(q.map((i) => i.label)).toEqual(['Fresh topic', 'Stale topic', 'Strong topic', 'Weak topic']);
  });
});

describe('totals', () => {
  it('counts attempts, grading and active days', () => {
    const events = [
      at(local(2026, 3, 1, 10), { correct: true }),
      at(local(2026, 3, 1, 11), { correct: false }),
      at(local(2026, 3, 2, 10)),
    ];
    const t = totals(events);
    expect(t.attempts).toBe(3);
    expect(t.graded).toBe(2);
    expect(t.correct).toBe(1);
    expect(t.accuracy).toBe(0.5);
    expect(t.activeDays).toBe(2);
    expect(t.firstSeen).toBe(local(2026, 3, 1, 10));
    expect(t.lastSeen).toBe(local(2026, 3, 2, 10));
  });

  it('handles an empty log', () => {
    const t = totals([]);
    expect(t.attempts).toBe(0);
    expect(t.accuracy).toBeNull();
    expect(t.firstSeen).toBeNull();
  });
});
