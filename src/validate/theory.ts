// Does the phrase stay inside the music it claims to be in?

import { limitsFor } from '../generate/limits';
import { availablePitches } from '../generate/pitch';
import type { ExerciseSpec, Phrase } from '../generate/types';
import { scaleNotes } from '../music/theory/keys';
import { pitchClassOf } from '../music/theory/spelling';
import { pitchClass } from '../music/notes';
import { violation, type Violation } from './types';

export function validateTheory(phrase: Phrase, spec: ExerciseSpec): Violation[] {
  const out: Violation[] = [];
  const allowed = new Set(scaleNotes(spec.key, spec.scale).map(pitchClassOf));
  const profile = limitsFor(spec.technique, spec.difficulty);

  phrase.events.forEach((e, i) => {
    // A bent note sounds at its target pitch, so that is what must be in key.
    const sounding = e.midi + (e.bend ?? 0);
    if (!allowed.has(pitchClass(sounding))) {
      out.push(
        violation('theory', 'out-of-scale', `Note ${i} sounds a pitch outside ${spec.key} ${spec.scale}.`, i),
      );
    }
  });

  // Neighbouring notes of the scale are always allowed, however wide they
  // happen to be: a minor-pentatonic step is three semitones, and a leap
  // ceiling of two would make the scale unwalkable rather than easy.
  const ladder = availablePitches(spec.key, spec.scale, phrase.tuning, phrase.window);
  const isScaleStep = (a: number, b: number): boolean => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return !ladder.some((p) => p > lo && p < hi);
  };

  for (let i = 1; i < phrase.events.length; i++) {
    const leap = Math.abs(phrase.events[i].midi - phrase.events[i - 1].midi);
    if (leap > profile.maxLeap && !isScaleStep(phrase.events[i - 1].midi, phrase.events[i].midi)) {
      out.push(
        violation(
          'theory',
          'leap-too-wide',
          `Notes ${i - 1}→${i} leap ${leap} semitones; this exercise allows ${profile.maxLeap}.`,
          i,
        ),
      );
    }
  }

  if (phrase.events.length === 0) {
    out.push(violation('theory', 'empty', 'The phrase has no notes.'));
  }
  return out;
}
