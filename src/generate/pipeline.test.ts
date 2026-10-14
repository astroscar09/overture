import { describe, expect, it } from 'vitest';
import { validate } from '../validate';
import { GenerationError, generateExercise } from './pipeline';
import { limitsFor } from './limits';
import { availablePitches } from './pitch';
import { STANDARD } from '../music/tuning';
import { STYLE_IDS } from './styleProfiles';
import { TECHNIQUES, type Difficulty, type ExerciseSpec, type TechniqueId } from './types';

const base = (over: Partial<ExerciseSpec> = {}): ExerciseSpec => ({
  technique: 'alternate',
  key: 'E',
  scale: 'minor pentatonic',
  window: [5, 10],
  bars: 2,
  difficulty: 3,
  bpm: 100,
  seed: 1,
  ...over,
});

const ALL: TechniqueId[] = TECHNIQUES.map((t) => t.id);
const TIERS: Difficulty[] = [1, 2, 3, 4, 5];

describe('determinism', () => {
  it('the same spec and seed rebuild the same phrase', () => {
    for (const technique of ALL) {
      const spec = base({ technique, window: [5, 12], difficulty: 4 });
      const a = generateExercise(spec);
      const b = generateExercise(spec);
      expect(a.phrase).toEqual(b.phrase);
      expect(a.attempts).toBe(b.attempts);
    }
  });

  it('different seeds give different phrases', () => {
    const shapes = new Set(
      Array.from({ length: 12 }, (_, i) =>
        JSON.stringify(generateExercise(base({ seed: i + 1, window: [5, 12] })).phrase.events),
      ),
    );
    expect(shapes.size).toBeGreaterThan(6);
  });

  it('records the seed it was asked for', () => {
    const spec = base({ seed: 4242 });
    expect(generateExercise(spec).phrase.meta.seed).toBe(4242);
  });
});

describe('nothing invalid ever escapes the pipeline', () => {
  // The central property: whatever the generator does internally, the thing it
  // returns satisfies all four validators. Swept across every technique, every
  // difficulty and many seeds.
  for (const technique of ALL) {
    it(`${technique}: 60 seeds x 5 difficulties produce zero violations`, () => {
      const failures: string[] = [];
      for (const difficulty of TIERS) {
        for (let seed = 1; seed <= 60; seed++) {
          const spec = base({ technique, difficulty, seed, window: [5, 12], bars: 2 });
          let phrase;
          try {
            phrase = generateExercise(spec).phrase;
          } catch (error) {
            failures.push(`d${difficulty} s${seed}: threw ${(error as Error).message.slice(0, 60)}`);
            continue;
          }
          const violations = validate(phrase, spec);
          if (violations.length) {
            failures.push(`d${difficulty} s${seed}: ${violations.map((v) => v.rule).join(',')}`);
          }
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }
});

describe('the spec is honoured', () => {
  it('fills exactly the number of bars asked for', () => {
    for (const bars of [1, 2, 4]) {
      const phrase = generateExercise(base({ bars, window: [5, 12] })).phrase;
      expect(phrase.bars).toBe(bars);
      const last = phrase.events[phrase.events.length - 1];
      expect(last.start + last.dur).toBe(bars * 1920);
    }
  });

  it('stays inside the fret window', () => {
    for (const window of [[0, 4], [5, 9], [9, 15]] as [number, number][]) {
      for (let seed = 1; seed <= 20; seed++) {
        const phrase = generateExercise(base({ window, seed, difficulty: 4 })).phrase;
        for (const e of phrase.events) {
          if (e.fret === 0) continue;
          expect(e.fret).toBeGreaterThanOrEqual(window[0]);
          expect(e.fret).toBeLessThanOrEqual(window[1]);
        }
      }
    }
  });

  it('respects the leap ceiling, except for a plain scale step', () => {
    // The rule is "no jump wider than the tier allows, unless it is a single
    // step of the scale" — otherwise minor pentatonic, whose smallest step is
    // three semitones, would be unplayable at the easiest tier.
    const ladder = availablePitches('E', 'minor pentatonic', STANDARD, [5, 12]);
    const isStep = (a: number, b: number) =>
      !ladder.some((p) => p > Math.min(a, b) && p < Math.max(a, b));

    for (const technique of ALL) {
      for (const difficulty of TIERS) {
        const profile = limitsFor(technique, difficulty);
        for (let seed = 1; seed <= 15; seed++) {
          const phrase = generateExercise(base({ technique, difficulty, seed, window: [5, 12] })).phrase;
          for (let i = 1; i < phrase.events.length; i++) {
            const from = phrase.events[i - 1].midi;
            const to = phrase.events[i].midi;
            const leap = Math.abs(to - from);
            if (leap > profile.maxLeap) expect(isStep(from, to)).toBe(true);
          }
        }
      }
    }
  });

  it('never repeats the same pitch twice in a row', () => {
    // A stutter reads as a mistake, and legato cannot slur a unison. Phrasing
    // is the deliberate exception: real lead playing repeats a note about a
    // fifth of the time (see styleProfiles.test.ts), so it is shaped to do
    // the same rather than forced to move on every step.
    for (const technique of ALL) {
      if (technique === 'phrasing') continue;
      for (let seed = 1; seed <= 20; seed++) {
        const phrase = generateExercise(base({ technique, seed, window: [5, 12] })).phrase;
        for (let i = 1; i < phrase.events.length; i++) {
          if (phrase.meta.contour === 'pedal') continue;
          expect(phrase.events[i].midi).not.toBe(phrase.events[i - 1].midi);
        }
      }
    }
  });

  it('keeps the fretting hand inside its span for every technique and tier', () => {
    for (const technique of ALL) {
      for (const difficulty of TIERS) {
        const profile = limitsFor(technique, difficulty);
        for (let seed = 1; seed <= 15; seed++) {
          const phrase = generateExercise(base({ technique, difficulty, seed, window: [5, 12] })).phrase;
          for (let i = 0; i + 4 <= phrase.events.length; i++) {
            const frets = phrase.events.slice(i, i + 4).filter((e) => e.fret > 0).map((e) => e.fret);
            if (frets.length < 2) continue;
            expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(profile.maxSpan);
          }
        }
      }
    }
  });

  it('works in several keys and scales', () => {
    const combos: [string, string][] = [
      ['E', 'minor pentatonic'], ['A', 'blues'], ['G', 'mixolydian'],
      ['C', 'major'], ['F#', 'aeolian'], ['Bb', 'dorian'],
    ];
    for (const [key, scale] of combos) {
      for (let seed = 1; seed <= 10; seed++) {
        const spec = base({ key, scale, seed, window: [5, 12], difficulty: 4 });
        expect(validate(generateExercise(spec).phrase, spec)).toEqual([]);
      }
    }
  });
});

describe('each technique produces what it says', () => {
  it('alternate picking strictly alternates', () => {
    const phrase = generateExercise(base({ technique: 'alternate', window: [5, 12] })).phrase;
    phrase.events.forEach((e, i) => {
      expect(e.attack).toBe('pick');
      expect(e.pickDir).toBe(i % 2 === 0 ? 'down' : 'up');
    });
  });

  it('legato picks once per string and slurs the rest', () => {
    const phrase = generateExercise(base({ technique: 'legato', window: [5, 12] })).phrase;
    const picked = phrase.events.filter((e) => e.attack === 'pick').length;
    expect(picked).toBeLessThan(phrase.events.length);
    expect(phrase.events.some((e) => e.attack === 'hammer' || e.attack === 'pull')).toBe(true);
  });

  it('string skipping actually skips strings', () => {
    const phrase = generateExercise(base({ technique: 'skipping', window: [5, 12], difficulty: 4 })).phrase;
    const skips = phrase.events.filter((e, i) => i > 0 && Math.abs(e.string - phrase.events[i - 1].string) >= 2);
    expect(skips.length).toBeGreaterThan(0);
  });

  it('gallops are the gallop figure on every beat', () => {
    const phrase = generateExercise(base({ technique: 'gallop', window: [5, 12] })).phrase;
    const durations = phrase.events.map((e) => e.dur);
    for (let i = 0; i < durations.length; i += 3) {
      const beat = durations.slice(i, i + 3);
      expect(beat.reduce((a, b) => a + b, 0)).toBe(480);
    }
  });

  it('bursts change gear', () => {
    const phrase = generateExercise(base({ technique: 'burst', window: [5, 12], difficulty: 4 })).phrase;
    const durations = new Set(phrase.events.map((e) => e.dur));
    expect(durations.size).toBeGreaterThan(1);
  });

  it('bends land on scale tones, on bendable strings, with time to do it', () => {
    const phrase = generateExercise(base({ technique: 'bending', window: [5, 12], difficulty: 3 })).phrase;
    const bends = phrase.events.filter((e) => e.bend !== undefined);
    expect(bends.length).toBeGreaterThan(0);
    for (const b of bends) {
      expect(b.string).toBeGreaterThanOrEqual(2);
      expect(b.fret).toBeGreaterThan(0);
      expect([1, 2]).toContain(b.bend);
      expect(b.dur).toBeGreaterThanOrEqual(240);
    }
  });
});

describe('phrasing shapes a lick from the style it is given', () => {
  it('builds cleanly for every measured style, plus the pooled default', () => {
    for (const style of [...STYLE_IDS, undefined]) {
      for (let seed = 1; seed <= 10; seed++) {
        const spec = base({ technique: 'phrasing', style, seed, window: [5, 12], difficulty: 4 });
        expect(validate(generateExercise(spec).phrase, spec)).toEqual([]);
      }
    }
  });

  it('repeats notes and turns around, unlike a fixed-pattern drill', () => {
    // Pooled across enough seeds that an unlucky single phrase cannot fail
    // this — the claim is about the shape overall, not any one exercise.
    let repeats = 0;
    let reversals = 0;
    let bends = 0;
    let notes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const phrase = generateExercise(base({ technique: 'phrasing', seed, window: [5, 12], difficulty: 4 })).phrase;
      notes += phrase.events.length;
      bends += phrase.events.filter((e) => e.bend !== undefined).length;
      for (let i = 1; i < phrase.events.length; i++) {
        if (phrase.events[i].midi === phrase.events[i - 1].midi) repeats++;
      }
      for (let i = 2; i < phrase.events.length; i++) {
        const a = Math.sign(phrase.events[i - 1].midi - phrase.events[i - 2].midi);
        const b = Math.sign(phrase.events[i].midi - phrase.events[i - 1].midi);
        if (a !== 0 && b !== 0 && a !== b) reversals++;
      }
    }
    expect(repeats).toBeGreaterThan(0);
    expect(reversals).toBeGreaterThan(0);
    expect(bends).toBeGreaterThan(0);
    expect(notes).toBeGreaterThan(0);
  });

  it('stores the style on the phrase it built, defaulting to the pooled profile', () => {
    const named = generateExercise(base({ technique: 'phrasing', style: 'metal', window: [5, 12] })).phrase;
    expect(named.meta.contour).toBe('metal');
    const defaulted = generateExercise(base({ technique: 'phrasing', window: [5, 12] })).phrase;
    expect(defaulted.meta.contour).toBe('all');
  });
});

describe('failure is loud', () => {
  it('throws with the reasons when a window holds nothing playable', () => {
    // A one-fret window in a key with nothing on that fret.
    expect(() => generateExercise(base({ window: [1, 1], key: 'E', scale: 'minor pentatonic' })))
      .toThrow(GenerationError);
  });

  it('the error carries the violations and the spec', () => {
    try {
      generateExercise(base({ window: [1, 1] }));
      expect.unreachable('should have thrown');
    } catch (error) {
      const e = error as GenerationError;
      expect(e.violations.length).toBeGreaterThan(0);
      expect(e.spec.window).toEqual([1, 1]);
      expect(e.message).toMatch(/Could not build/);
    }
  });
});
