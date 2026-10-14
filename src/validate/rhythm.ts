// Does the phrase add up?
//
// Everything is integer ticks, so "adds up" is exact: each bar either fills
// or it does not. Nothing here is approximate.

import { barTicks } from '../music/time';
import { FOUR_FOUR } from '../music/time';
import type { ExerciseSpec, Phrase } from '../generate/types';
import { violation, type Violation } from './types';

export function validateRhythm(phrase: Phrase, spec: ExerciseSpec): Violation[] {
  const out: Violation[] = [];
  const sig = phrase.timeSig ?? FOUR_FOUR;
  const perBar = barTicks(sig);
  const total = perBar * phrase.bars;

  phrase.events.forEach((e, i) => {
    if (!Number.isInteger(e.start) || !Number.isInteger(e.dur)) {
      out.push(violation('rhythm', 'non-integer', `Note ${i} has a fractional position or length.`, i));
    }
    if (e.dur <= 0) out.push(violation('rhythm', 'zero-length', `Note ${i} has no length.`, i));
    if (e.start < 0) out.push(violation('rhythm', 'before-start', `Note ${i} starts before the phrase.`, i));
    if (e.start + e.dur > total) {
      out.push(violation('rhythm', 'past-end', `Note ${i} runs past the end of bar ${phrase.bars}.`, i));
    }
    // An exercise is read a bar at a time; a note tied over the line is not
    // wrong music, but it is wrong for this.
    if (Math.floor(e.start / perBar) !== Math.floor((e.start + e.dur - 1) / perBar)) {
      out.push(violation('rhythm', 'crosses-bar', `Note ${i} crosses a bar line.`, i));
    }
  });

  for (let i = 1; i < phrase.events.length; i++) {
    const prev = phrase.events[i - 1];
    const here = phrase.events[i];
    if (here.start < prev.start) {
      out.push(violation('rhythm', 'unsorted', `Note ${i} starts before the note before it.`, i));
    }
    if (here.start < prev.start + prev.dur) {
      out.push(violation('rhythm', 'overlap', `Notes ${i - 1} and ${i} overlap; the line is monophonic.`, i));
    }
  }

  // Every bar must be completely filled — no silent gaps in a technique drill.
  for (let bar = 0; bar < phrase.bars; bar++) {
    const from = bar * perBar;
    const sounded = phrase.events
      .filter((e) => e.start >= from && e.start < from + perBar)
      .reduce((sum, e) => sum + e.dur, 0);
    if (sounded !== perBar) {
      out.push(
        violation('rhythm', 'bar-not-filled', `Bar ${bar + 1} holds ${sounded} ticks; a bar is ${perBar}.`),
      );
    }
  }

  if (spec.bars !== phrase.bars) {
    out.push(violation('rhythm', 'wrong-length', `Asked for ${spec.bars} bars, built ${phrase.bars}.`));
  }
  return out;
}
