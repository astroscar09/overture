// Turning the attempt log into something worth looking at.
//
// Nothing here stores anything. Every number is derived from the append-only
// event log on read, so the way progress is measured can change without
// invalidating what was recorded. All of it is pure and takes `today` as an
// argument, which is what makes it testable.

import { TECHNIQUES } from '../generate/types';
import type { AttemptEvent, AttemptKind } from './progress';
import { cleanTempo, dayOf, localDay, statsByRef } from './progress';

// ---- Labels ----

const ROUTINE_NAMES: Record<string, string> = {
  '3nps': '3NPS positions',
  improv: 'Improv',
  noteFinder: 'Note finder',
  chordTones: 'Chord tones',
  circle: 'Circle of fifths',
  keyTargets: 'Key targets (retired)',
};

export interface LabelSource {
  id: string;
  title: string;
}

/**
 * A readable name for a log reference. The caller passes the topic lists it
 * knows about so this module does not have to depend on the exercise registry.
 */
export function labelFor(ref: string, topics: readonly LabelSource[] = []): string {
  const topic = topics.find((t) => t.id === ref);
  if (topic) return topic.title;
  if (ref.startsWith('technique:')) {
    const id = ref.slice('technique:'.length);
    return TECHNIQUES.find((t) => t.id === id)?.name ?? id;
  }
  return ROUTINE_NAMES[ref] ?? ref;
}

// ---- Time ----

/** The local day an ISO timestamp falls on. */
export const dayKey = (iso: string): string => localDay(new Date(iso));

/**
 * The Monday of the week a date falls in. Local, like everything else here —
 * a week that starts at midnight UTC would begin mid-afternoon for half the
 * world.
 */
export function weekStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay: 0 = Sunday, so a Monday start means shifting Sunday back six days.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

// ---- Trends ----

export interface TrendPoint {
  /** YYYY-MM-DD: the day, or the Monday of the week. */
  period: string;
  attempts: number;
  /** 0–1 over graded attempts, or null when nothing was graded. */
  accuracy: number | null;
  medianResponseMs: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarise(period: string, events: readonly AttemptEvent[]): TrendPoint {
  const graded = events.filter((e) => typeof e.correct === 'boolean');
  const times = events.map((e) => e.responseMs).filter((n): n is number => typeof n === 'number');
  return {
    period,
    attempts: events.length,
    accuracy: graded.length ? graded.filter((e) => e.correct).length / graded.length : null,
    medianResponseMs: median(times),
  };
}

/** One point per day, oldest first, including days with nothing on them. */
export function trendByDay(
  events: readonly AttemptEvent[],
  days: number,
  today = new Date(),
  kind?: AttemptKind,
): TrendPoint[] {
  const pool = kind ? events.filter((e) => e.kind === kind) : events;
  const end = localDay(today);
  return Array.from({ length: days }, (_, i) => {
    const period = addDays(end, i - days + 1);
    return summarise(period, pool.filter((e) => dayOf(e) === period));
  });
}

/** One point per calendar week (Monday start), oldest first. */
export function trendByWeek(
  events: readonly AttemptEvent[],
  weeks: number,
  today = new Date(),
  kind?: AttemptKind,
): TrendPoint[] {
  const pool = kind ? events.filter((e) => e.kind === kind) : events;
  const thisWeek = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const period = addDays(thisWeek, (i - weeks + 1) * 7);
    return summarise(period, pool.filter((e) => weekStart(new Date(e.ts)) === period));
  });
}

// ---- Weekly goal ----

export interface WeeklyGoal {
  /** Attempts to make across the week. */
  attempts: number;
  /** Separate days to show up on. */
  days: number;
}

export const DEFAULT_GOAL: WeeklyGoal = { attempts: 120, days: 4 };

export interface GoalProgress {
  weekOf: string;
  attempts: { done: number; target: number; met: boolean };
  days: { done: number; target: number; met: boolean };
  met: boolean;
}

export function weekProgress(
  events: readonly AttemptEvent[],
  goal: WeeklyGoal = DEFAULT_GOAL,
  today = new Date(),
): GoalProgress {
  const week = weekStart(today);
  const thisWeek = events.filter((e) => weekStart(new Date(e.ts)) === week);
  const attempts = thisWeek.length;
  const days = new Set(thisWeek.map(dayOf)).size;
  const attemptsMet = attempts >= goal.attempts;
  const daysMet = days >= goal.days;
  return {
    weekOf: week,
    attempts: { done: attempts, target: goal.attempts, met: attemptsMet },
    days: { done: days, target: goal.days, met: daysMet },
    met: attemptsMet && daysMet,
  };
}

// ---- Clean technique tempos ----

export interface TempoRow {
  ref: string;
  label: string;
  best: number | null;
  /** The most recent clean tempo, which may be lower than the best. */
  latest: number | null;
  runs: number;
}

export function cleanTempos(events: readonly AttemptEvent[]): TempoRow[] {
  return TECHNIQUES.map(({ id, name }) => {
    const ref = `technique:${id}`;
    const clean = events.filter((e) => e.ref === ref && e.clean === true && typeof e.bpm === 'number');
    return {
      ref,
      label: name,
      best: cleanTempo(events, ref),
      latest: clean.length ? (clean[clean.length - 1].bpm as number) : null,
      runs: clean.length,
    };
  });
}

// ---- What to work on next ----

export interface ReviewItem {
  ref: string;
  label: string;
  kind: AttemptKind;
  /** Higher means more worth doing. */
  priority: number;
  /** Why it is on the list, in words. */
  reason: string;
  attempts: number;
  accuracy: number | null;
  daysSince: number | null;
}

/** Past this, a topic counts as fully stale however long it has really been. */
const STALE_DAYS = 14;
/**
 * Where an untried topic sits. Below something you are actively getting
 * wrong — a 50% score is a live problem, an untouched topic is only a
 * suggestion — but above something you are already good at.
 */
const UNTRIED_PRIORITY = 0.9;

function daysBetween(fromIso: string, today: Date): number {
  const [fy, fm, fd] = dayKey(fromIso).split('-').map(Number);
  const then = new Date(fy, fm - 1, fd).getTime();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((now - then) / 86400000));
}

/**
 * The topics most worth returning to, weakest and stalest first.
 *
 * The score is deliberately simple enough to explain on screen: how far short
 * of right you are, weighted double, plus how long it has been. A topic you
 * have never touched sits in the middle — worth starting, but not ahead of
 * something you are actively getting wrong.
 */
export function reviewQueue(
  events: readonly AttemptEvent[],
  known: readonly { id: string; title: string; kind: AttemptKind }[],
  today = new Date(),
): ReviewItem[] {
  const stats = statsByRef(events);
  const items: ReviewItem[] = known.map(({ id, title, kind }) => {
    const s = stats.get(id);
    const attempts = s?.attempts ?? 0;
    const accuracy = s?.accuracy ?? null;
    const daysSince = s?.lastSeen ? daysBetween(s.lastSeen, today) : null;

    if (attempts === 0) {
      return {
        ref: id, label: title, kind, attempts, accuracy, daysSince,
        priority: UNTRIED_PRIORITY,
        reason: 'Not started yet.',
      };
    }
    // A technique run is not marked right or wrong, so there is no weakness to
    // measure — for those, how long it has been is the whole signal. Inventing
    // a middling score would float them above topics you are genuinely failing.
    const weakness = accuracy === null ? 0 : 1 - accuracy;
    const staleness = Math.min(daysSince ?? 0, STALE_DAYS) / STALE_DAYS;
    const priority = weakness * 2 + staleness;

    const parts: string[] = [];
    if (accuracy !== null) parts.push(`${Math.round(accuracy * 100)}% over ${attempts} attempt${attempts === 1 ? '' : 's'}`);
    else parts.push(`${attempts} run${attempts === 1 ? '' : 's'}, not scored`);
    if (daysSince !== null) {
      parts.push(daysSince === 0 ? 'practised today' : daysSince === 1 ? 'last seen yesterday' : `last seen ${daysSince} days ago`);
    }
    return { ref: id, label: title, kind, attempts, accuracy, daysSince, priority, reason: `${parts.join(', ')}.` };
  });

  return items.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
}

// ---- Totals ----

export interface Totals {
  attempts: number;
  graded: number;
  correct: number;
  accuracy: number | null;
  /** Distinct days with any activity. */
  activeDays: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export function totals(events: readonly AttemptEvent[]): Totals {
  const graded = events.filter((e) => typeof e.correct === 'boolean');
  const correct = graded.filter((e) => e.correct).length;
  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
  return {
    attempts: events.length,
    graded: graded.length,
    correct,
    accuracy: graded.length ? correct / graded.length : null,
    activeDays: new Set(events.map(dayOf)).size,
    firstSeen: sorted[0]?.ts ?? null,
    lastSeen: sorted[sorted.length - 1]?.ts ?? null,
  };
}
