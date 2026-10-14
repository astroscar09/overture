import { describe, expect, it } from 'vitest';
import { makeRng } from '../generate/rng';
import { majorKey } from '../music/theory/keys';
import { KEY_SIGNATURES_TOPIC, keysForTier } from './keySignatures';
import { generateQuestion, grade, typesForTier, type TheoryQuestion } from './types';

const topic = KEY_SIGNATURES_TOPIC;

/** Every question this topic can produce at a tier, across many seeds. */
function sweep(tier: number, seeds = 300): TheoryQuestion[] {
  return Array.from({ length: seeds }, (_, i) => generateQuestion(topic, tier, makeRng(i + 1)));
}

describe('determinism', () => {
  it('rebuilds the same question from the same seed', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const data = (q: TheoryQuestion) => JSON.parse(JSON.stringify(q));
      const a = generateQuestion(topic, tier, makeRng(42));
      const b = generateQuestion(topic, tier, makeRng(42));
      expect(data(a)).toEqual(data(b));
    }
  });

  it('gives different questions from different seeds', () => {
    const ids = new Set(sweep(3, 50).map((q) => q.id));
    expect(ids.size).toBeGreaterThan(10);
  });

  it('gives a question the same id whenever its content repeats', () => {
    const byId = new Map<string, string>();
    for (const q of sweep(2, 400)) {
      const fingerprint = `${q.prompt}|${q.answer.join(',')}`;
      const seen = byId.get(q.id);
      if (seen) expect(seen).toBe(fingerprint);
      byId.set(q.id, fingerprint);
    }
  });
});

describe('every generated question is well formed', () => {
  for (let tier = 1; tier <= 5; tier++) {
    it(`tier ${tier}`, () => {
      for (const q of sweep(tier, 200)) {
        expect(q.topicId).toBe(topic.id);
        expect(q.tier).toBe(tier);
        expect(q.prompt.length).toBeGreaterThan(5);
        expect(q.rationale.length).toBeGreaterThan(5);
        expect(q.answer.length).toBeGreaterThan(0);

        if (q.mode === 'multiple-choice') {
          expect(q.choices).toBeDefined();
          // Four options, all distinct, with exactly one right.
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices!.map((c) => c.id)).size).toBe(4);
          expect(q.answer).toHaveLength(1);
          const rightOnes = q.choices!.filter((c) => q.answer.includes(c.id));
          expect(rightOnes).toHaveLength(1);
        }
        if (q.mode === 'multiple-select') {
          expect(q.choices!.length).toBeGreaterThan(q.answer.length);
          // Every right answer is actually on offer.
          for (const a of q.answer) expect(q.choices!.map((c) => c.id)).toContain(a);
        }
        if (q.mode === 'build-sequence') {
          expect(q.pool).toBeDefined();
          expect([...q.pool!.map((c) => c.id)].sort()).toEqual([...q.answer].sort());
          expect(q.matching).toBe('ordered');
        }
        if (q.mode === 'fretboard-select') {
          expect(q.fretboard!.targets.length).toBeGreaterThan(0);
          expect(q.matching).toBe('any');
          // The anchor marks must not give the answer away.
          const targetKeys = new Set(q.answer);
          for (const m of q.fretboard!.marks) {
            expect(targetKeys.has(`${m.string}:${m.fret}`)).toBe(false);
          }
        }
      }
    });
  }
});

describe('grading', () => {
  it('accepts the right answer and rejects a wrong one', () => {
    for (const q of sweep(3, 100)) {
      const right = grade(q, q.answer.length && q.matching === 'any' ? [q.answer[0]] : q.answer);
      expect(right.correct).toBe(true);
      expect(right.diagnosis).toBeNull();

      const wrongPick =
        q.mode === 'build-sequence'
          ? [...q.answer].reverse()
          : q.choices?.find((c) => !q.answer.includes(c.id))?.id;
      if (wrongPick) {
        const wrong = grade(q, Array.isArray(wrongPick) ? wrongPick : [wrongPick]);
        expect(wrong.correct).toBe(false);
        expect(wrong.rationale.length).toBeGreaterThan(0);
      }
    }
  });

  it('a build-sequence in the wrong order is wrong', () => {
    const q = sweep(5, 300).find((x) => x.mode === 'build-sequence' && x.answer.length > 2)!;
    expect(q).toBeDefined();
    const swapped = [...q.answer];
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    expect(grade(q, swapped).correct).toBe(false);
    expect(grade(q, q.answer).correct).toBe(true);
  });

  it('a fretboard answer accepts any one correct spot but not two', () => {
    const q = sweep(4, 300).find((x) => x.mode === 'fretboard-select')!;
    expect(q).toBeDefined();
    for (const spot of q.answer) expect(grade(q, [spot]).correct).toBe(true);
    expect(grade(q, q.answer.slice(0, 2)).correct).toBe(false);
    expect(grade(q, ['0:0']).correct).toBe(false);
  });

  it('multiple-select needs all of them and nothing extra', () => {
    const q = sweep(4, 300).find((x) => x.mode === 'multiple-select')!;
    expect(q).toBeDefined();
    expect(grade(q, q.answer).correct).toBe(true);
    expect(grade(q, q.answer.slice(0, -1)).correct).toBe(false);
    const extra = q.choices!.find((c) => !q.answer.includes(c.id))!.id;
    expect(grade(q, [...q.answer, extra]).correct).toBe(false);
  });
});

describe('the answers are musically correct', () => {
  it('counts accidentals the way the key signature does', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'count-accidentals')) {
      const tonic = /of (\S+) major/.exec(q.prompt)![1];
      const info = majorKey(tonic);
      const expected =
        info.accidentals === 0
          ? 'no sharps or flats'
          : `${info.accidentals} ${info.type === 'sharps' ? 'sharp' : 'flat'}${info.accidentals === 1 ? '' : 's'}`;
      expect(q.answer[0]).toBe(expected);
    }
  });

  it('spells scales exactly as the theory layer does', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'spell-scale')) {
      const tonic = /the (\S+) major scale/.exec(q.prompt)![1];
      expect(q.answer[0]).toBe(majorKey(tonic).scale.join(' '));
    }
  });

  it('only ever names altered notes as altered', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'altered-notes')) {
      for (const note of q.answer) expect(note.length).toBeGreaterThan(1);
      const naturals = q.choices!.map((c) => c.id).filter((n) => !q.answer.includes(n));
      for (const note of naturals) expect(note.length).toBe(1);
    }
  });

  it('names the key that really carries that signature', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'name-from-signature')) {
      const m = /has (\d+) (sharp|flat)s?\?/.exec(q.prompt)!;
      const info = majorKey(q.answer[0]);
      expect(info.accidentals).toBe(Number(m[1]));
      expect(info.type).toBe(`${m[2]}s`);
    }
  });
});

describe('difficulty progression', () => {
  it('offers more question types as the tier rises', () => {
    const counts = [1, 2, 3, 4, 5].map((t) => typesForTier(topic, t).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[4]).toBeGreaterThan(counts[0]);
  });

  it('starts with easy keys and works out to the far side of the circle', () => {
    expect(keysForTier(1).every((k) => majorKey(k).accidentals <= 2)).toBe(true);
    expect(keysForTier(5).some((k) => majorKey(k).accidentals >= 5)).toBe(true);
  });

  it('clamps a tier outside the range rather than failing', () => {
    expect(keysForTier(0)).toEqual(keysForTier(1));
    expect(keysForTier(99)).toEqual(keysForTier(5));
  });
});

describe('feedback', () => {
  it('explains a wrong answer, not just marks it', () => {
    let diagnosed = 0;
    let checked = 0;
    for (const q of sweep(4, 200)) {
      const wrong = q.choices?.find((c) => !q.answer.includes(c.id))?.id;
      if (!wrong) continue;
      checked++;
      const g = grade(q, [wrong]);
      if (g.diagnosis && g.diagnosis.length > 10) diagnosed++;
    }
    expect(checked).toBeGreaterThan(50);
    // Every pick-one question should have something useful to say.
    expect(diagnosed).toBe(checked);
  });

  it('spots the relative-minor trap by name', () => {
    const qs = sweep(5, 500).filter((x) => x.typeId === 'name-from-signature');
    const withTrap = qs.find((q) => q.choices!.some((c) => c.id === majorKey(q.answer[0]).relative));
    expect(withTrap).toBeDefined();
    const relative = majorKey(withTrap!.answer[0]).relative;
    expect(grade(withTrap!, [relative]).diagnosis).toMatch(/relative major|minor/i);
  });
});
