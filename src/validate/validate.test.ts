import { describe, expect, it } from 'vitest';
import { FOUR_FOUR, noteTicks } from '../music/time';
import { STANDARD } from '../music/tuning';
import type { ExerciseSpec, NoteEvent, Phrase, TechniqueId } from '../generate/types';
import { validate, validatePlayability, validateRhythm, validateTechnique, validateTheory } from './index';
import { GALLOP, GALLOP_FILLS_A_BEAT } from './technique';

// A deliberately plain, correct phrase: one bar of eighths in an E minor
// pentatonic box at the 12th fret, two strings, strictly alternate picked.
// Every fret here was checked against the scale rather than guessed — fret 9
// on the A string is F#, which is exactly the sort of thing that slips past.
const OPEN = STANDARD.openMidi;
const BOX: [number, number][] = [
  [1, 12], [1, 14], [2, 12], [2, 14], [2, 14], [2, 12], [1, 14], [1, 12],
];

function basePhrase(over: Partial<Phrase> = {}): Phrase {
  const events: NoteEvent[] = BOX.map(([string, fret], i) => ({
    midi: OPEN[string] + fret,
    string,
    fret,
    start: i * noteTicks(8),
    dur: noteTicks(8),
    attack: 'pick',
    pickDir: i % 2 === 0 ? 'down' : 'up',
  }));
  return {
    tuning: STANDARD,
    timeSig: FOUR_FOUR,
    bars: 1,
    events,
    window: [12, 14],
    meta: { seed: 1, technique: 'alternate', key: 'E', scale: 'minor pentatonic', difficulty: 5, bpm: 100, contour: 'run' },
    ...over,
  };
}

const spec = (over: Partial<ExerciseSpec> = {}): ExerciseSpec => ({
  technique: 'alternate',
  key: 'E',
  scale: 'minor pentatonic',
  window: [12, 14],
  bars: 1,
  difficulty: 5,
  bpm: 100,
  seed: 1,
  ...over,
});

/** The heart of the independence claim: break one rule, see exactly one validator fire. */
function onlyFires(phrase: Phrase, s: ExerciseSpec, expected: string) {
  const results = {
    theory: validateTheory(phrase, s),
    rhythm: validateRhythm(phrase, s),
    playability: validatePlayability(phrase, s),
    technique: validateTechnique(phrase, s),
  };
  for (const [name, found] of Object.entries(results)) {
    if (name === expected) expect(found.length, `${name} should have fired`).toBeGreaterThan(0);
    else expect(found, `${name} should have stayed quiet`).toEqual([]);
  }
  return results[expected as keyof typeof results];
}

describe('the baseline phrase is clean', () => {
  it('passes all four validators', () => {
    expect(validate(basePhrase(), spec())).toEqual([]);
  });
});

describe('theory', () => {
  it('catches a note outside the scale, and nothing else does', () => {
    const p = basePhrase();
    // A string fret 13 is A#, which is not in E minor pentatonic. It stays
    // inside the window and the hand span, so only theory should object.
    p.events[1] = { ...p.events[1], fret: 13, midi: OPEN[1] + 13 };
    const found = onlyFires(p, spec(), 'theory');
    expect(found[0].rule).toBe('out-of-scale');
  });

  it('judges a bent note by where it lands, not where it starts', () => {
    // G string fret 13 is G#, out of key; bent up a semitone it reaches A,
    // which is in. The sounding pitch is the one that counts.
    const p = basePhrase({
      events: [{ midi: OPEN[3] + 13, string: 3, fret: 13, start: 0, dur: noteTicks(1), attack: 'pick', bend: 1 }],
      meta: { ...basePhrase().meta, technique: 'bending' },
    });
    expect(validateTheory(p, spec({ technique: 'bending' }))).toEqual([]);
    const unbent = { ...p, events: [{ ...p.events[0], bend: undefined }] };
    expect(validateTheory(unbent, spec({ technique: 'bending' })).some((v) => v.rule === 'out-of-scale')).toBe(true);
  });

  it('catches a leap too wide for the difficulty', () => {
    const p = basePhrase();
    // A(57) up to G(67) on the G string is ten semitones.
    p.events[1] = { ...p.events[1], string: 3, fret: 12, midi: OPEN[3] + 12 };
    const found = validateTheory(p, spec({ difficulty: 1 }));
    expect(found.some((v) => v.rule === 'leap-too-wide')).toBe(true);
  });

  it('calls an empty phrase empty', () => {
    expect(validateTheory(basePhrase({ events: [] }), spec()).some((v) => v.rule === 'empty')).toBe(true);
  });
});

describe('rhythm', () => {
  it('catches a bar that does not add up, and nothing else does', () => {
    const p = basePhrase();
    p.events = p.events.slice(0, 7);
    const found = onlyFires(p, spec(), 'rhythm');
    expect(found[0].rule).toBe('bar-not-filled');
  });

  it('catches overlapping notes', () => {
    const p = basePhrase();
    p.events[4] = { ...p.events[4], start: p.events[3].start };
    expect(validateRhythm(p, spec()).some((v) => v.rule === 'overlap')).toBe(true);
  });

  it('catches a note running past the end', () => {
    const p = basePhrase();
    p.events[7] = { ...p.events[7], dur: noteTicks(2) };
    expect(validateRhythm(p, spec()).some((v) => v.rule === 'past-end')).toBe(true);
  });

  it('catches a note crossing a bar line', () => {
    const p = basePhrase({ bars: 2 });
    p.events = [
      { ...p.events[0], start: noteTicks(8) * 15, dur: noteTicks(4) },
    ];
    expect(validateRhythm(p, spec({ bars: 2 })).some((v) => v.rule === 'crosses-bar')).toBe(true);
  });

  it('catches fractional ticks', () => {
    const p = basePhrase();
    p.events[2] = { ...p.events[2], dur: 123.5 };
    expect(validateRhythm(p, spec()).some((v) => v.rule === 'non-integer')).toBe(true);
  });
});

describe('playability', () => {
  it('catches a stretch beyond the hand, and nothing else does', () => {
    // The same B played two ways — A string fret 14 and G string fret 4. The
    // pitch never moves, so theory has nothing to say, but the hand is being
    // asked to jump ten frets.
    const pairs: [number, number][] = [[1, 14], [3, 4], [1, 14], [3, 4], [1, 14], [3, 4], [1, 14], [3, 4]];
    const p = basePhrase({
      window: [4, 14],
      events: pairs.map(([string, fret], i) => ({
        midi: OPEN[string] + fret, string, fret,
        start: i * noteTicks(8), dur: noteTicks(8),
        attack: 'pick' as const, pickDir: i % 2 === 0 ? ('down' as const) : ('up' as const),
      })),
    });
    const found = onlyFires(p, spec({ difficulty: 1, window: [4, 14] }), 'playability');
    expect(found.some((v) => v.rule === 'span-too-wide')).toBe(true);
  });

  it('catches a fret that does not sound the pitch it claims', () => {
    const p = basePhrase();
    p.events[2] = { ...p.events[2], midi: p.events[2].midi + 3 };
    expect(validatePlayability(p, spec()).some((v) => v.rule === 'wrong-pitch')).toBe(true);
  });

  it('catches a note outside the fret window', () => {
    const p = basePhrase({ window: [5, 9] });
    expect(validatePlayability(p, spec({ window: [5, 9] })).some((v) => v.rule === 'outside-window')).toBe(true);
  });

  it('allows an open string even when the window starts higher', () => {
    const p = basePhrase({
      window: [5, 9],
      events: [{ midi: OPEN[1], string: 1, fret: 0, start: 0, dur: noteTicks(1), attack: 'pick', pickDir: 'down' }],
    });
    expect(validatePlayability(p, spec({ window: [5, 9] })).some((v) => v.rule === 'outside-window')).toBe(false);
  });

  it('refuses to bend an open string or a wound low string', () => {
    const p = basePhrase();
    p.events[0] = { ...p.events[0], fret: 0, midi: OPEN[1], bend: 1 };
    const found = validatePlayability(p, spec());
    expect(found.some((v) => v.rule === 'bend-open-string')).toBe(true);
    expect(found.some((v) => v.rule === 'bend-low-string')).toBe(true);
  });

  it('catches two notes sharing a string at the same moment', () => {
    const p = basePhrase();
    p.events[1] = { ...p.events[1], start: 0 };
    expect(validatePlayability(p, spec()).some((v) => v.rule === 'same-string-overlap')).toBe(true);
  });
});

describe('technique', () => {
  it('catches a repeated pick stroke, and nothing else does', () => {
    const p = basePhrase();
    p.events[4] = { ...p.events[4], pickDir: p.events[3].pickDir };
    const found = onlyFires(p, spec(), 'technique');
    expect(found.some((v) => v.rule === 'broken-alternation')).toBe(true);
  });

  it('legato wants one pick per string and slurs in the right direction', () => {
    const p = basePhrase({ meta: { ...basePhrase().meta, technique: 'legato' } });
    p.events = [5, 7, 10, 12, 10, 7, 5, 2].map((fret, i) => ({
      midi: OPEN[1] + fret, string: 1, fret,
      start: i * noteTicks(8), dur: noteTicks(8),
      attack: i === 0 ? ('pick' as const) : i <= 3 ? ('hammer' as const) : ('pull' as const),
    }));
    expect(validateTechnique(p, spec({ technique: 'legato' }))).toEqual([]);

    p.events[2] = { ...p.events[2], attack: 'pick' };
    expect(validateTechnique(p, spec({ technique: 'legato' })).some((v) => v.rule === 'extra-pick')).toBe(true);

    p.events[2] = { ...p.events[2], attack: 'pull' };
    expect(validateTechnique(p, spec({ technique: 'legato' })).some((v) => v.rule === 'pull-up')).toBe(true);
  });

  it('string skipping must actually skip', () => {
    const p = basePhrase({ meta: { ...basePhrase().meta, technique: 'skipping' } });
    expect(validateTechnique(p, spec({ technique: 'skipping' })).some((v) => v.rule === 'too-few-skips')).toBe(true);
  });

  it('a burst needs a change of gear and a run of fast notes', () => {
    const p = basePhrase({ meta: { ...basePhrase().meta, technique: 'burst' } });
    expect(validateTechnique(p, spec({ technique: 'burst' })).some((v) => v.rule === 'no-burst')).toBe(true);
  });

  it('the gallop figure fills exactly one beat', () => {
    expect(GALLOP_FILLS_A_BEAT).toBe(true);
    expect(GALLOP).toEqual([240, 120, 120]);
  });

  it('a gallop beat must be the gallop figure', () => {
    const p = basePhrase({ meta: { ...basePhrase().meta, technique: 'gallop' } });
    const frets = [2, 5, 7, 10, 12, 14, 12, 10, 7, 5, 2, 5];
    let t = 0;
    p.events = frets.map((fret, i) => {
      const dur = GALLOP[i % 3];
      const e: NoteEvent = { midi: OPEN[1] + fret, string: 1, fret, start: t, dur, attack: 'pick', pickDir: 'down' };
      t += dur;
      return e;
    });
    expect(validateTechnique(p, spec({ technique: 'gallop' }))).toEqual([]);

    p.events[1] = { ...p.events[1], dur: noteTicks(8) };
    expect(validateTechnique(p, spec({ technique: 'gallop' })).some((v) => v.rule === 'not-a-gallop')).toBe(true);
  });

  it('a bending exercise needs bends with room to breathe', () => {
    const p = basePhrase({ meta: { ...basePhrase().meta, technique: 'bending' } });
    expect(validateTechnique(p, spec({ technique: 'bending' })).some((v) => v.rule === 'no-bends')).toBe(true);
  });

  it('notices when the phrase was built for a different technique', () => {
    const found = validateTechnique(basePhrase(), spec({ technique: 'legato' }));
    expect(found[0].rule).toBe('wrong-technique');
  });

  it('has a rule set for every technique', () => {
    const all: TechniqueId[] = ['alternate', 'legato', 'skipping', 'burst', 'gallop', 'bending'];
    for (const technique of all) {
      const found = validateTechnique(
        basePhrase({ meta: { ...basePhrase().meta, technique } }),
        spec({ technique }),
      );
      expect(found.every((v) => v.rule !== 'unknown-technique')).toBe(true);
    }
  });
});
