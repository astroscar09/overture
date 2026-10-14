// Can a hand actually do this?

import { limitsFor } from '../generate/limits';
import type { ExerciseSpec, Phrase } from '../generate/types';
import { violation, type Violation } from './types';

/** How many consecutive notes the hand is considered to hold at once. */
const SPAN_WINDOW = 4;

export function validatePlayability(phrase: Phrase, spec: ExerciseSpec): Violation[] {
  const out: Violation[] = [];
  const profile = limitsFor(spec.technique, spec.difficulty);
  const [lo, hi] = phrase.window;
  const strings = phrase.tuning.openMidi.length;

  phrase.events.forEach((e, i) => {
    if (e.string < 0 || e.string >= strings) {
      out.push(violation('playability', 'no-such-string', `Note ${i} is on string ${e.string}.`, i));
    }
    if (e.fret < 0) out.push(violation('playability', 'negative-fret', `Note ${i} is behind the nut.`, i));
    // Open strings are allowed only when the window reaches the nut.
    if (e.fret !== 0 && (e.fret < lo || e.fret > hi)) {
      out.push(
        violation('playability', 'outside-window', `Note ${i} is at fret ${e.fret}, outside ${lo}–${hi}.`, i),
      );
    }
    if (e.string >= 0 && e.string < strings) {
      const expected = phrase.tuning.openMidi[e.string] + e.fret;
      if (expected !== e.midi) {
        out.push(
          violation('playability', 'wrong-pitch', `Note ${i} says MIDI ${e.midi} but that spot sounds ${expected}.`, i),
        );
      }
    }
  });

  // The fretting hand covers a limited span at any moment.
  for (let i = 0; i + SPAN_WINDOW <= phrase.events.length; i++) {
    const group = phrase.events.slice(i, i + SPAN_WINDOW).filter((e) => e.fret > 0);
    if (group.length < 2) continue;
    const frets = group.map((e) => e.fret);
    const span = Math.max(...frets) - Math.min(...frets);
    if (span > profile.maxSpan) {
      out.push(
        violation(
          'playability',
          'span-too-wide',
          `Notes ${i}–${i + SPAN_WINDOW - 1} span ${span} frets; difficulty ${spec.difficulty} allows ${profile.maxSpan}.`,
          i,
        ),
      );
    }
  }

  const maxJump = profile.maxStringJump;
  for (let i = 1; i < phrase.events.length; i++) {
    const jump = Math.abs(phrase.events[i].string - phrase.events[i - 1].string);
    if (jump > maxJump) {
      out.push(
        violation(
          'playability',
          'string-jump-too-far',
          `Notes ${i - 1}→${i} cross ${jump} strings; this exercise allows ${maxJump}.`,
          i,
        ),
      );
    }
  }

  // Two notes cannot sound on one string at the same time.
  for (let i = 1; i < phrase.events.length; i++) {
    const prev = phrase.events[i - 1];
    const here = phrase.events[i];
    if (here.string === prev.string && here.start < prev.start + prev.dur) {
      out.push(
        violation('playability', 'same-string-overlap', `Notes ${i - 1} and ${i} share a string and overlap.`, i),
      );
    }
  }

  phrase.events.forEach((e, i) => {
    if (e.bend === undefined) return;
    if (e.fret === 0) {
      out.push(violation('playability', 'bend-open-string', `Note ${i} bends an open string.`, i));
    }
    // The wound low strings do not bend usefully far.
    if (e.string < 2) {
      out.push(violation('playability', 'bend-low-string', `Note ${i} bends string ${e.string}, too heavy to bend.`, i));
    }
    if (e.bend > 2) {
      out.push(violation('playability', 'bend-too-far', `Note ${i} bends ${e.bend} semitones.`, i));
    }
  });

  return out;
}
