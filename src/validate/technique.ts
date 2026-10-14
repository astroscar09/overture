// Does the phrase actually drill the technique it claims to?
//
// One rule set per family, each reading only the finished phrase. Adding a
// seventh technique means adding a seventh entry here and nothing else.

import { PPQ, beatTicks, noteTicks } from '../music/time';
import type { ExerciseSpec, NoteEvent, Phrase, TechniqueId } from '../generate/types';
import { violation, type Violation } from './types';

/** The gallop: an eighth and two sixteenths, filling one beat. */
export const GALLOP = [noteTicks(8), noteTicks(16), noteTicks(16)];
/** Reversed, which is just as common in metal. */
export const REVERSE_GALLOP = [noteTicks(16), noteTicks(16), noteTicks(8)];

type Rules = (phrase: Phrase, spec: ExerciseSpec) => Violation[];

/** Notes grouped into consecutive runs that stay on one string. */
function stringRuns(events: readonly NoteEvent[]): NoteEvent[][] {
  const runs: NoteEvent[][] = [];
  for (const e of events) {
    const last = runs[runs.length - 1];
    if (last && last[0].string === e.string) last.push(e);
    else runs.push([e]);
  }
  return runs;
}

const alternate: Rules = (phrase) => {
  const out: Violation[] = [];
  let expected: 'down' | 'up' | null = null;
  phrase.events.forEach((e, i) => {
    if (e.attack !== 'pick') {
      out.push(violation('technique', 'not-picked', `Note ${i} is not picked; alternate picking picks every note.`, i));
      return;
    }
    if (!e.pickDir) {
      out.push(violation('technique', 'no-stroke', `Note ${i} has no picking direction.`, i));
      return;
    }
    if (expected && e.pickDir !== expected) {
      out.push(violation('technique', 'broken-alternation', `Note ${i} repeats a ${e.pickDir}stroke.`, i));
    }
    expected = e.pickDir === 'down' ? 'up' : 'down';
  });
  return out;
};

const legato: Rules = (phrase) => {
  const out: Violation[] = [];
  for (const run of stringRuns(phrase.events)) {
    const index = phrase.events.indexOf(run[0]);
    if (run[0].attack !== 'pick') {
      out.push(violation('technique', 'run-not-started', `Note ${index} starts a string and should be picked.`, index));
    }
    run.slice(1).forEach((e, j) => {
      const at = phrase.events.indexOf(e);
      if (e.attack === 'pick') {
        out.push(violation('technique', 'extra-pick', `Note ${at} is picked mid-string; legato slurs it.`, at));
        return;
      }
      const prev = run[j];
      if (e.attack === 'hammer' && e.midi <= prev.midi) {
        out.push(violation('technique', 'hammer-down', `Note ${at} hammers onto a lower note.`, at));
      }
      if (e.attack === 'pull' && e.midi >= prev.midi) {
        out.push(violation('technique', 'pull-up', `Note ${at} pulls off to a higher note.`, at));
      }
    });
  }
  return out;
};

const skipping: Rules = (phrase) => {
  const out: Violation[] = [];
  let skips = 0;
  for (let i = 1; i < phrase.events.length; i++) {
    const gap = Math.abs(phrase.events[i].string - phrase.events[i - 1].string);
    if (gap >= 2) skips++;
  }
  // A string-skipping exercise that never skips is just picking.
  const wanted = Math.max(2, Math.floor(phrase.events.length / 8));
  if (skips < wanted) {
    out.push(
      violation('technique', 'too-few-skips', `Only ${skips} string skips; this exercise needs at least ${wanted}.`),
    );
  }
  return out;
};

const burst: Rules = (phrase, spec) => {
  const out: Violation[] = [];
  const durations = phrase.events.map((e) => e.dur);
  const fastest = Math.min(...durations);
  const slowest = Math.max(...durations);
  if (fastest === slowest) {
    out.push(violation('technique', 'no-burst', 'Every note is the same length; a burst exercise needs a change of gear.'));
    return out;
  }
  // A burst is a run of at least four notes at the fastest value.
  let longest = 0;
  let current = 0;
  for (const d of durations) {
    current = d === fastest ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  if (longest < 4) {
    out.push(violation('technique', 'burst-too-short', `Longest fast run is ${longest} notes; a burst is at least 4.`));
  }
  if (slowest / fastest < 2) {
    out.push(violation('technique', 'gear-change-too-small', 'The fast notes should be at least twice the rate of the slow ones.'));
  }
  void spec;
  return out;
};

const gallop: Rules = (phrase) => {
  const out: Violation[] = [];
  const beat = beatTicks(phrase.timeSig);
  const byBeat = new Map<number, NoteEvent[]>();
  for (const e of phrase.events) {
    const index = Math.floor(e.start / beat);
    byBeat.set(index, [...(byBeat.get(index) ?? []), e]);
  }
  for (const [index, notes] of byBeat) {
    const shape = notes.map((n) => n.dur);
    const isGallop =
      shape.length === GALLOP.length &&
      (shape.every((d, i) => d === GALLOP[i]) || shape.every((d, i) => d === REVERSE_GALLOP[i]));
    if (!isGallop) {
      out.push(
        violation('technique', 'not-a-gallop', `Beat ${index + 1} is ${shape.join('+')} ticks, not the gallop figure.`),
      );
    }
  }
  return out;
};

const bending: Rules = (phrase) => {
  const out: Violation[] = [];
  const bends = phrase.events.filter((e) => e.bend !== undefined);
  if (bends.length === 0) {
    out.push(violation('technique', 'no-bends', 'A bending exercise with no bends in it.'));
  }
  phrase.events.forEach((e, i) => {
    if (e.bend === undefined) return;
    // A bend needs room to happen: anything shorter than an eighth is a flick.
    if (e.dur < noteTicks(8)) {
      out.push(violation('technique', 'bend-too-quick', `Note ${i} is too short to bend and hold.`, i));
    }
    if (e.bend !== 1 && e.bend !== 2) {
      out.push(violation('technique', 'odd-bend', `Note ${i} bends ${e.bend} semitones; use a half or whole step.`, i));
    }
  });
  return out;
};

// A lick is judged musical, not mechanical — theory, rhythm and playability
// already cover correctness, so there is nothing technique-specific to check.
const phrasing: Rules = () => [];

const RULES: Record<TechniqueId, Rules> = {
  alternate,
  legato,
  skipping,
  burst,
  gallop,
  bending,
  phrasing,
};

export function validateTechnique(phrase: Phrase, spec: ExerciseSpec): Violation[] {
  const rules = RULES[spec.technique];
  if (!rules) return [violation('technique', 'unknown-technique', `No rules for "${spec.technique}".`)];
  if (phrase.meta.technique !== spec.technique) {
    return [violation('technique', 'wrong-technique', `Phrase says ${phrase.meta.technique}, spec says ${spec.technique}.`)];
  }
  return rules(phrase, spec);
}

/** Sanity: the gallop figure fills exactly one quarter-note beat. */
export const GALLOP_TICKS = GALLOP.reduce((a, b) => a + b, 0);
export const GALLOP_FILLS_A_BEAT = GALLOP_TICKS === PPQ;
