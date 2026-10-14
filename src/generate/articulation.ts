// How each note is attacked: the picking hand, the slurs, and the bends.
//
// This runs last, once the notes and their places are fixed, because what the
// right hand does depends on where the left hand ended up.

import { noteTicks } from '../music/time';
import { pitchClass } from '../music/notes';
import { scaleNotes } from '../music/theory/keys';
import { pitchClassOf } from '../music/theory/spelling';
import { chance, type Rng } from './rng';
import type { StyleProfile } from './styleProfiles';
import type { NoteEvent, TechniqueId } from './types';

/** Strict down-up across every note, starting on a downstroke. */
function alternatePicking(events: NoteEvent[]): void {
  events.forEach((e, i) => {
    e.attack = 'pick';
    e.pickDir = i % 2 === 0 ? 'down' : 'up';
  });
}

/** One pick per string; hammer when climbing, pull when falling. */
function legatoSlurs(events: NoteEvent[]): void {
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (!prev || prev.string !== e.string) {
      e.attack = 'pick';
      e.pickDir = 'down';
      delete e.bend;
      return;
    }
    delete e.pickDir;
    e.attack = e.midi > prev.midi ? 'hammer' : e.midi < prev.midi ? 'pull' : 'pick';
    // A repeated pitch cannot be slurred, so it gets picked after all.
    if (e.attack === 'pick') e.pickDir = 'down';
  });
}

/**
 * Bend a note up to the next scale tone where there is time, and where the
 * string will take it. The bent note keeps its written fret; the target is
 * what sounds.
 */
function addBends(events: NoteEvent[], key: string, scale: string): void {
  const tones = new Set(scaleNotes(key, scale).map(pitchClassOf));
  for (const e of events) {
    delete e.bend;
    if (e.string < 2 || e.fret === 0 || e.dur < noteTicks(8)) continue;
    // A whole step if that lands in the scale, otherwise a half step.
    const whole = tones.has(pitchClass(e.midi + 2));
    const half = tones.has(pitchClass(e.midi + 1));
    if (whole) e.bend = 2;
    else if (half) e.bend = 1;
  }
}

/**
 * Bend some notes at about the rate the style profile measured, rather than
 * every eligible note — a lick does not bend everything it could.
 */
function addStyleBends(rng: Rng, events: NoteEvent[], key: string, scale: string, profile: StyleProfile): void {
  const tones = new Set(scaleNotes(key, scale).map(pitchClassOf));
  for (const e of events) {
    delete e.bend;
    if (e.string < 2 || e.fret === 0 || e.dur < noteTicks(8)) continue;
    if (!chance(rng, profile.bends.rate)) continue;
    const whole = tones.has(pitchClass(e.midi + 2));
    const half = tones.has(pitchClass(e.midi + 1));
    if (!whole && !half) continue;
    // null only when the sample had no bends at all, in which case rate is 0
    // and this line is unreachable; the fallback is just to satisfy the type.
    const preferWhole = chance(rng, profile.bends.wholeStepShare ?? 0.5);
    if (preferWhole && whole) e.bend = 2;
    else if (!preferWhole && half) e.bend = 1;
    else if (whole) e.bend = 2;
    else e.bend = 1;
  }
}

export function articulate(
  events: NoteEvent[],
  technique: TechniqueId,
  key: string,
  scale: string,
  rng?: Rng,
  style?: StyleProfile,
): void {
  switch (technique) {
    case 'legato':
      legatoSlurs(events);
      break;
    case 'bending':
      alternatePicking(events);
      addBends(events, key, scale);
      break;
    case 'phrasing':
      alternatePicking(events);
      if (rng && style) addStyleBends(rng, events, key, scale, style);
      break;
    default:
      alternatePicking(events);
  }
}
