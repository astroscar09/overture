// Choosing how long each note lasts, before knowing what the notes are.
//
// A bar is built beat by beat and must tile exactly, in integers. If a pattern
// cannot fill the beat it is not used — there is no rounding step anywhere.

import { beatTicks, noteTicks, tupletTicks, type TimeSignature, type Ticks } from '../music/time';
import { pick, weighted, type Rng } from './rng';
import type { StyleProfile } from './styleProfiles';
import { DIFFICULTY, type Difficulty, type TechniqueId } from './types';

/** The gallop and its mirror, each filling one quarter-note beat. */
const GALLOP: Ticks[] = [noteTicks(8), noteTicks(16), noteTicks(16)];
const REVERSE_GALLOP: Ticks[] = [noteTicks(16), noteTicks(16), noteTicks(8)];

/** Ways a single beat can be divided, by how fast the exercise is allowed. */
function beatPatterns(technique: TechniqueId, difficulty: Difficulty): Ticks[][] {
  const profile = DIFFICULTY[difficulty];
  const beat = noteTicks(4);
  const eighths = [noteTicks(8), noteTicks(8)];
  const sixteenths = [noteTicks(16), noteTicks(16), noteTicks(16), noteTicks(16)];
  const triplets = [tupletTicks(8, 3, 2), tupletTicks(8, 3, 2), tupletTicks(8, 3, 2)];
  const sextuplets = new Array(6).fill(tupletTicks(16, 6, 4));

  switch (technique) {
    case 'gallop':
      return [GALLOP, REVERSE_GALLOP];
    case 'bending':
      // Bends need time; nothing shorter than an eighth, mostly longer.
      return [[beat], [beat], eighths];
    case 'legato': {
      const out: Ticks[][] = [eighths];
      if (profile.tuplets) out.push(triplets);
      if (profile.fastestValue >= 16) out.push(sixteenths);
      if (profile.fastestValue >= 32 && profile.tuplets) out.push(sextuplets);
      return out;
    }
    case 'burst': {
      // Always two gears, and the fast one is always twice the rate of the
      // slow one. At the easy tiers that is quarters against eighths rather
      // than no burst at all.
      return profile.fastestValue >= 16 ? [eighths, sixteenths] : [[beat], eighths];
    }
    default: {
      const out: Ticks[][] = [eighths];
      if (profile.fastestValue >= 16) out.push(sixteenths);
      if (profile.tuplets) out.push(triplets);
      return out;
    }
  }
}

/**
 * Durations for the whole phrase, in order. They are guaranteed to tile every
 * bar exactly — the rhythm validator checks it, but this never relies on that.
 */
export function planRhythm(
  rng: Rng,
  technique: TechniqueId,
  difficulty: Difficulty,
  bars: number,
  sig: TimeSignature,
): Ticks[] {
  const patterns = beatPatterns(technique, difficulty);
  const perBeat = beatTicks(sig);
  const out: Ticks[] = [];

  // Bursts are deliberate: a run of fast beats inside otherwise steady ones.
  const burstBeats = new Set<number>();
  if (technique === 'burst') {
    const total = bars * sig.beats;
    const burstStart = Math.max(0, Math.floor(rng() * Math.max(1, total - 2)));
    for (let i = 0; i < 2; i++) burstBeats.add(burstStart + i);
  }

  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < sig.beats; beat++) {
      const index = bar * sig.beats + beat;
      let pattern: Ticks[];
      if (technique === 'burst') {
        pattern = burstBeats.has(index) ? patterns[patterns.length - 1] : patterns[0];
      } else if (technique === 'bending') {
        // One sustained note per beat mostly, so each bend has room.
        pattern = beat % 2 === 0 ? patterns[0] : pick(rng, patterns);
      } else {
        pattern = pick(rng, patterns);
      }
      const sum = pattern.reduce((a, b) => a + b, 0);
      if (sum !== perBeat) throw new Error(`planRhythm: pattern sums to ${sum}, beat is ${perBeat}`);
      out.push(...pattern);
    }
  }
  return out;
}

// The analyser counts ticks as PPQ/value (see tools/style-analyser/analyse.py),
// so its quarter note is 240 ticks against our 480 — half of ours.
const MEASURED_TICKS_SCALE = 2;

/**
 * Durations for a phrasing exercise, picked to match the note-length mix the
 * style profile actually measured rather than a fixed rotation of patterns.
 * Still tiles every beat exactly — only which pattern wins each beat is
 * weighted, not the tiling itself.
 */
export function planPhraseRhythm(
  rng: Rng,
  profile: StyleProfile,
  difficulty: Difficulty,
  bars: number,
  sig: TimeSignature,
): Ticks[] {
  const limits = DIFFICULTY[difficulty];
  const beat = noteTicks(4);
  const candidates: { pattern: Ticks[]; noteLength: Ticks }[] = [
    { pattern: [beat], noteLength: noteTicks(4) },
    { pattern: [noteTicks(8), noteTicks(8)], noteLength: noteTicks(8) },
  ];
  if (limits.fastestValue >= 16) {
    candidates.push({
      pattern: [noteTicks(16), noteTicks(16), noteTicks(16), noteTicks(16)],
      noteLength: noteTicks(16),
    });
  }
  if (limits.tuplets) {
    const triplet = tupletTicks(8, 3, 2);
    candidates.push({ pattern: [triplet, triplet, triplet], noteLength: triplet });
  }

  const weights = candidates.map((c) => ({
    item: c.pattern,
    // A note length the profile never saw still gets a small floor weight,
    // so an unmeasured combination (a rare style/difficulty pairing) can
    // still produce something rather than always falling back to one shape.
    weight: profile.rhythm.histogram[String(c.noteLength / MEASURED_TICKS_SCALE)] ?? 0.02,
  }));

  const perBeat = beatTicks(sig);
  const out: Ticks[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat2 = 0; beat2 < sig.beats; beat2++) {
      const pattern = weighted(rng, weights);
      const sum = pattern.reduce((a, b) => a + b, 0);
      if (sum !== perBeat) throw new Error(`planPhraseRhythm: pattern sums to ${sum}, beat is ${perBeat}`);
      out.push(...pattern);
    }
  }
  return out;
}
