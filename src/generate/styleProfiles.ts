// Measured phrasing targets, by style.
//
// The generator is correct by construction — four validators see to that — but
// correct is not the same as musical. These numbers come from measuring real
// lead playing (see tools/style-analyser), so the generator has something to
// aim at other than my guesses about what a solo does.
//
// Nothing here is a hard limit. Limits live in limits.ts and stay authoritative;
// a profile only says what to prefer inside them.

import report from './styleProfiles.json';

/** A histogram of shares that sum to roughly 1, keyed by a stringified number. */
export type Histogram = Record<string, number>;

export interface StyleProfile {
  /** How many lead passages and notes the profile was measured from. */
  passages: number;
  notes: number;
  bars: number;
  notesPerBar: number;

  intervals: {
    /** Semitone distance between consecutive notes; 12 is "an octave or more". */
    histogram: Histogram;
    /** Share of steps that stay on the same note. The generator used to be 0. */
    repeatRate: number;
    /** Share of steps of 1–3 semitones. */
    stepwiseRate: number;
    /** Share of steps of 5 semitones or more. */
    leapRate: number;
  };

  contour: {
    /** Notes played per change of direction. Real playing turns around often. */
    notesPerReversal: number;
    medianRun: number;
    maxRun: number;
  };

  rhythm: {
    /** Note length in ticks (960 per quarter in the source files) to share. */
    histogram: Histogram;
    dominantTicks: number;
    dominantShare: number;
  };

  /** Share of notes carrying each effect, highest first. */
  technique: Record<string, number>;

  bends: {
    rate: number;
    /** null when the style's sample contained no bends. */
    medianSemitones: number | null;
    wholeStepShare: number | null;
  };

  /** Fret spread across any four consecutive notes — what the hand must cover. */
  hand: { medianSpan: number; p90Span: number; maxSpan: number };

  strings: {
    /** Share of notes on the top three strings. */
    topThreeShare: number;
    /** How often consecutive notes stay on one string; separates lead from arpeggio. */
    sameStringRate: number;
    distribution: Histogram;
  };

  position: { medianFret: number; lowFret: number; highFret: number };

  tonality: {
    /**
     * Share of notes on the passage's five most-used pitch classes.
     * Deliberately independent of any tonic: a solo does not state its own key
     * (the harmony does), and the generator works in whatever key the user
     * picked, so only the concentration matters, not which five notes.
     */
    coreFiveShare: number;
    /** Share outside the best-fitting seven-note scale. Rotation-invariant. */
    chromaticRate: number;
    distinctPitchClasses: number;
  };

  /** Where bars tend to end. */
  phraseEnds: { onCoreFive: number };

  /**
   * Advisory mode mix, for interest only. Reported because it is cheap, not
   * because it is reliable — see `tonality` for why the generator ignores it.
   */
  likelyScales: { share: number; mix: Record<string, number> };
}

export interface StyleReport {
  generatedAt: string;
  note: string;
  profiles: Record<string, StyleProfile>;
}

const typed = report as unknown as StyleReport;

/** Every style measured, plus `all` — the whole sample pooled. */
export const STYLE_PROFILES: Record<string, StyleProfile> = typed.profiles;

export const STYLE_IDS: readonly string[] = Object.keys(typed.profiles)
  .filter((id) => id !== 'all')
  .sort();

/** The pooled profile, used when no style has been chosen. */
export const DEFAULT_STYLE = 'all';

export function styleProfile(id: string = DEFAULT_STYLE): StyleProfile {
  const profile = typed.profiles[id];
  if (!profile) {
    throw new Error(`Unknown style "${id}". Known: ${Object.keys(typed.profiles).join(', ')}`);
  }
  return profile;
}

/** When the profiles were last measured — shown in the dev tooling. */
export const MEASURED_AT = typed.generatedAt;
