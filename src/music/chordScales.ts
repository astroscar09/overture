// Chord-scale relationships: which scales/modes "fit" a chord (contain all of
// its tones), and the theory-preferred default for each chord quality. Used by
// the two-chord improv view so each chord offers only compatible modes.

import { SCALES } from './scales';
import { CHORD_QUALITIES } from './chordTones';

// The natural first choice of scale for each chord quality.
export const DEFAULT_SCALE_BY_QUALITY: Record<string, string> = {
  maj: 'major',
  min: 'minor',
  dom7: 'mixolydian',
  m7: 'dorian',
  maj7: 'major',
  dim: 'locrian',
  aug: 'wholeTone',
  m7b5: 'locrian',
  sus2: 'major',
  sus4: 'major',
};

/** Semitone intervals (from the root) that make up a chord quality. */
function chordIntervals(qualityId: string): number[] {
  const spec = CHORD_QUALITIES[qualityId] ?? CHORD_QUALITIES.maj;
  return spec.tones.map((t) => ((t.semitone % 12) + 12) % 12);
}

/**
 * Scale keys whose notes contain every tone of the chord (so you can solo the
 * mode over the chord). Root-independent: both are measured from the same root.
 */
export function compatibleScaleKeys(qualityId: string): string[] {
  const chord = chordIntervals(qualityId);
  const keys = Object.keys(SCALES).filter((key) => {
    const scale = new Set(SCALES[key].intervals);
    return chord.every((i) => scale.has(i));
  });
  // Guarantee the default is present and listed first.
  const def = defaultScaleKey(qualityId);
  const ordered = [def, ...keys.filter((k) => k !== def)];
  // Drop the default if it somehow isn't actually compatible (shouldn't happen).
  return keys.includes(def) ? ordered : keys.length ? keys : ['major'];
}

/** The preferred scale key for a quality (falls back to a compatible one). */
export function defaultScaleKey(qualityId: string): string {
  const preferred = DEFAULT_SCALE_BY_QUALITY[qualityId] ?? 'major';
  const chord = chordIntervals(qualityId);
  const scale = new Set(SCALES[preferred]?.intervals ?? []);
  if (chord.every((i) => scale.has(i))) return preferred;
  // Otherwise first scale that fits, else major.
  const fit = Object.keys(SCALES).find((key) => {
    const s = new Set(SCALES[key].intervals);
    return chord.every((i) => s.has(i));
  });
  return fit ?? 'major';
}
