import { describe, expect, it } from 'vitest';
import { makeRng } from '../generate/rng';
import { invert, semitones, spell, up, type IntervalName } from '../music/theory/intervals';
import { pitchName } from '../music/theory/spelling';
import { STANDARD } from '../music/tuning';
import { INTERVALS_TOPIC, intervalsForTier, isPlainSpelling, letterSpan, rootsForTier } from './intervals';
import { generateQuestion, grade, type TheoryQuestion } from './types';

const topic = INTERVALS_TOPIC;
const sweep = (tier: number, seeds = 300): TheoryQuestion[] =>
  Array.from({ length: seeds }, (_, i) => generateQuestion(topic, tier, makeRng(i + 1)));

describe('determinism', () => {
  it('rebuilds the same question from the same seed', () => {
    const data = (q: TheoryQuestion) => JSON.parse(JSON.stringify(q));
    for (let tier = 1; tier <= 5; tier++) {
      expect(data(generateQuestion(topic, tier, makeRng(7)))).toEqual(data(generateQuestion(topic, tier, makeRng(7))));
    }
  });
});

describe('every generated question is well formed', () => {
  for (let tier = 1; tier <= 5; tier++) {
    it(`tier ${tier}`, () => {
      for (const q of sweep(tier, 200)) {
        expect(q.topicId).toBe(topic.id);
        expect(q.prompt.length).toBeGreaterThan(5);
        expect(q.rationale.length).toBeGreaterThan(5);
        if (q.choices) {
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
          expect(q.choices.filter((c) => q.answer.includes(c.id))).toHaveLength(1);
        }
        if (q.mode === 'fretboard-select') {
          expect(q.fretboard!.targets.length).toBeGreaterThan(0);
          expect(q.matching).toBe('any');
        }
      }
    });
  }

  it('never asks for a note needing a double accidental', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const q of sweep(tier, 200)) {
        for (const c of q.choices ?? []) expect(isPlainSpelling(c.id)).toBe(true);
        expect(isPlainSpelling(q.prompt)).toBe(true);
        expect(isPlainSpelling(q.rationale)).toBe(true);
      }
    }
  });

  it('never writes "a augmented" or "a octave"', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const q of sweep(tier, 150)) {
        expect(q.prompt).not.toMatch(/\ba (augmented|octave|unison)\b/);
        expect(q.prompt).not.toMatch(/\ban (major|minor|perfect|diminished)\b/);
      }
    }
  });
});

describe('the intervals themselves are right', () => {
  it('names the interval between the two notes in the prompt', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'name-interval')) {
      const m = /from (\S+) up to (\S+)\?/.exec(q.prompt)!;
      // The answer must be the spoken name of the real interval between them.
      const candidates = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .filter((iv) => pitchName(up(`${m[1]}4`, iv)) === m[2]);
      expect(candidates.map(spell)).toContain(q.answer[0]);
    }
  });

  it('builds the right note above the root', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'build-interval')) {
      const m = /is an? (.+) above (\S+)\?/.exec(q.prompt)!;
      const interval = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .find((iv) => spell(iv) === m[1])!;
      expect(q.answer[0]).toBe(pitchName(up(`${m[2]}4`, interval)));
    }
  });

  it('counts semitones correctly', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'count-semitones')) {
      const name = /in an? (.+)\?/.exec(q.prompt)![1];
      const interval = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .find((iv) => spell(iv) === name)!;
      expect(Number(q.answer[0])).toBe(semitones(interval));
    }
  });

  it('inverts correctly, and the pair always spans an octave', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'invert-interval')) {
      const name = /inversion of an? (.+)\?/.exec(q.prompt)![1];
      const interval = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M'] as IntervalName[])
        .find((iv) => spell(iv) === name)!;
      expect(q.answer[0]).toBe(spell(invert(interval)));
      expect(semitones(interval) + semitones(invert(interval))).toBe(12);
    }
  });
});

describe('the neck questions are playable', () => {
  const openMidi = STANDARD.openMidi;

  it('puts every target at the right pitch above the marked root', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'find-interval-on-neck')) {
      const root = q.fretboard!.marks[0];
      const rootMidi = openMidi[root.string] + root.fret;
      const name = /find the (.+) above it\./.exec(q.prompt)![1];
      const interval = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .find((iv) => spell(iv) === name)!;
      for (const t of q.fretboard!.targets) {
        expect(openMidi[t.string] + t.fret).toBe(rootMidi + semitones(interval));
      }
    }
  });

  it('keeps every target within a hand span of the root', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'find-interval-on-neck')) {
      const root = q.fretboard!.marks[0];
      for (const t of q.fretboard!.targets) {
        expect(Math.abs(t.fret - root.fret)).toBeLessThanOrEqual(6);
      }
    }
  });

  it('keeps every spot on the neck', () => {
    for (const q of sweep(5, 400)) {
      for (const m of q.fretboard?.marks ?? []) {
        expect(m.string).toBeGreaterThanOrEqual(0);
        expect(m.string).toBeLessThan(openMidi.length);
        expect(m.fret).toBeGreaterThanOrEqual(0);
        expect(m.fret).toBeLessThanOrEqual(15);
      }
      for (const t of q.fretboard?.targets ?? []) {
        expect(t.fret).toBeGreaterThanOrEqual(0);
        expect(t.fret).toBeLessThanOrEqual(15);
      }
    }
  });

  it('never labels both marks with the same note name', () => {
    // An octave on the neck reads as a unison, or the context line answers it.
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'name-interval-on-neck')) {
      const [lo, hi] = q.fretboard!.marks;
      expect(lo.label).not.toBe(hi.label);
      expect(q.answer[0]).not.toBe('octave');
    }
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'find-interval-on-neck')) {
      expect(q.prompt).not.toMatch(/the octave above/);
    }
  });

  it('marks two notes a real interval apart when asking you to name it', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'name-interval-on-neck')) {
      const [lo, hi] = q.fretboard!.marks;
      const loMidi = openMidi[lo.string] + lo.fret;
      const hiMidi = openMidi[hi.string] + hi.fret;
      const interval = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .find((iv) => spell(iv) === q.answer[0])!;
      expect(hiMidi - loMidi).toBe(semitones(interval));
      // The upper note really is the upper note.
      expect(hiMidi).toBeGreaterThan(loMidi);
    }
  });
});

describe('grading and feedback', () => {
  it('accepts the answer and rejects a distractor', () => {
    for (const q of sweep(4, 200)) {
      const right = q.matching === 'any' ? [q.answer[0]] : q.answer;
      expect(grade(q, right).correct).toBe(true);
      const wrong = q.choices?.find((c) => !q.answer.includes(c.id))?.id;
      if (wrong) {
        const g = grade(q, [wrong]);
        expect(g.correct).toBe(false);
        expect(g.diagnosis).toBeTruthy();
      }
    }
  });

  it('accepts any reachable spot for a find-on-the-neck question', () => {
    const q = sweep(4, 400).find((x) => x.typeId === 'find-interval-on-neck' && x.answer.length > 1)!;
    expect(q).toBeDefined();
    for (const spot of q.answer) expect(grade(q, [spot]).correct).toBe(true);
  });

  it('calls out an inversion mistake by name', () => {
    const q = sweep(3, 400).find(
      (x) => x.typeId === 'name-interval' && x.choices!.some((c) => c.id === spell(invert(
        (['2m','2M','3m','3M','4P','5P','6m','6M','7m','7M'] as IntervalName[]).find((iv) => spell(iv) === x.answer[0])!,
      ))),
    )!;
    expect(q).toBeDefined();
    const interval = (['2m','2M','3m','3M','4P','5P','6m','6M','7m','7M'] as IntervalName[])
      .find((iv) => spell(iv) === q.answer[0])!;
    expect(grade(q, [spell(invert(interval))]).diagnosis).toMatch(/inversion/i);
  });
});

describe('the prose reads like English', () => {
  it('uses the right article before every interval name', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const q of sweep(tier, 200)) {
        const text = [q.prompt, q.context ?? '', q.rationale].join(' ');
        expect(text).not.toMatch(/\ba (augmented|octave|unison)\b/);
        expect(text).not.toMatch(/\ban (major|minor|perfect|diminished)\b/);
      }
    }
  });

  it('never starts a sentence with a lowercase interval name', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const q of sweep(tier, 200)) {
        for (const sentence of q.rationale.split(/(?<=[.!?])\s+/)) {
          expect(sentence).not.toMatch(/^(major|minor|perfect|augmented|diminished)\b/);
        }
      }
    }
  });

  it('describes a same-string shape as along one string, not zero strings across', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'name-interval-on-neck')) {
      expect(q.rationale).not.toMatch(/\b0 strings?\b/);
      const [lo, hi] = q.fretboard!.marks;
      if (lo.string === hi.string) expect(q.rationale).toMatch(/along the same string/);
      else expect(q.rationale).toMatch(/strings? (up|down)/);
    }
  });
});

describe('difficulty', () => {
  it('introduces the tritone only once intervals are familiar', () => {
    expect(intervalsForTier(1)).not.toContain('4A');
    expect(intervalsForTier(1)).not.toContain('5d');
    expect(intervalsForTier(4)).toContain('4A');
    expect(intervalsForTier(4)).toContain('5d');
  });

  it('starts on natural roots and adds accidentals later', () => {
    expect(rootsForTier(1).every((r) => r.length === 1)).toBe(true);
    expect(rootsForTier(5).some((r) => r.length > 1)).toBe(true);
  });

  it('offers more question types as the tier rises', () => {
    const at = (t: number) => topic.types.filter((x) => x.minTier <= t).length;
    expect(at(1)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThanOrEqual(at(5));
  });
});

describe('letterSpan', () => {
  it('counts both ends, the way intervals are numbered', () => {
    expect(letterSpan('C', 'E')).toBe(3);
    expect(letterSpan('C', 'C')).toBe(1);
    expect(letterSpan('A', 'C')).toBe(3);
    expect(letterSpan('F#', 'Bb')).toBe(4);
  });
});
