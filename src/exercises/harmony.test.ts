import { describe, expect, it } from 'vitest';
import { makeRng } from '../generate/rng';
import { diatonicTriads, fromRomanNumerals } from '../music/theory/harmony';
import {
  BORROWED,
  HARMONY_TOPIC,
  MAJOR_NUMERALS,
  MAJOR_PROGRESSIONS,
  MINOR_NUMERALS,
  MINOR_PROGRESSIONS,
  analyse,
  functionOf,
  keysForTier,
  modesForTier,
  numeralsFor,
} from './harmony';
import { generateQuestion, grade, type TheoryQuestion } from './types';

const topic = HARMONY_TOPIC;
const sweep = (tier: number, seeds = 300): TheoryQuestion[] =>
  Array.from({ length: seeds }, (_, i) => generateQuestion(topic, tier, makeRng(i + 1)));

describe('the numeral tables match real analysis', () => {
  // Written by hand, then checked against the analyser for every key.
  it('major keys harmonise as I ii iii IV V vi vii°', () => {
    for (const tonic of ['C', 'G', 'Eb', 'F#', 'Bb']) {
      expect(analyse(tonic, diatonicTriads(tonic, 'major'))).toEqual(MAJOR_NUMERALS);
    }
  });

  it('minor keys harmonise as i ii° III iv v VI VII', () => {
    for (const tonic of ['A', 'E', 'C', 'F#']) {
      expect(analyse(tonic, diatonicTriads(tonic, 'minor'), 'minor')).toEqual(MINOR_NUMERALS);
    }
  });

  it('round-trips every stored progression', () => {
    for (const p of [...MAJOR_PROGRESSIONS, ...MINOR_PROGRESSIONS]) {
      for (const tonic of ['C', 'G', 'A', 'E']) {
        const chords = fromRomanNumerals(tonic, p);
        expect(chords).toHaveLength(p.length);
        expect(chords.every((c) => c.length > 0)).toBe(true);
      }
    }
  });

  it('places the borrowed chords a semitone below the diatonic degree', () => {
    // In E major the bVII is D, not D#.
    expect(fromRomanNumerals('E', ['bVII'])[0]).toBe('D');
    expect(fromRomanNumerals('A', ['bIII'])[0]).toBe('C');
    expect(fromRomanNumerals('C', ['bVI'])[0]).toBe('Ab');
    for (const tonic of ['C', 'G', 'D', 'A', 'E']) {
      const diatonic = new Set(diatonicTriads(tonic, 'major'));
      for (const numeral of BORROWED) {
        expect(diatonic.has(fromRomanNumerals(tonic, [numeral])[0])).toBe(false);
      }
    }
  });
});

describe('harmonic function', () => {
  it('puts V and vii° on the dominant side, IV and ii on the subdominant', () => {
    expect(functionOf('major', 4)).toBe('dominant');
    expect(functionOf('major', 6)).toBe('dominant');
    expect(functionOf('major', 3)).toBe('subdominant');
    expect(functionOf('major', 1)).toBe('subdominant');
    expect(functionOf('major', 0)).toBe('tonic');
    expect(functionOf('minor', 0)).toBe('tonic');
  });
});

describe('determinism and shape', () => {
  it('rebuilds the same question from the same seed', () => {
    const data = (q: TheoryQuestion) => JSON.parse(JSON.stringify(q));
    for (let tier = 1; tier <= 5; tier++) {
      expect(data(generateQuestion(topic, tier, makeRng(9)))).toEqual(data(generateQuestion(topic, tier, makeRng(9))));
    }
  });

  for (let tier = 1; tier <= 5; tier++) {
    it(`tier ${tier} questions are well formed`, () => {
      for (const q of sweep(tier, 200)) {
        expect(q.topicId).toBe(topic.id);
        expect(q.prompt.length).toBeGreaterThan(5);
        expect(q.rationale.length).toBeGreaterThan(10);
        if (q.choices) {
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
          expect(q.choices.filter((c) => q.answer.includes(c.id))).toHaveLength(1);
        }
        if (q.mode === 'build-sequence') {
          // The pool must contain the answer, and may contain decoys.
          for (const a of q.answer) expect(q.pool!.map((c) => c.id)).toContain(a);
        }
      }
    });
  }
});

describe('the harmony is right', () => {
  it('numbers each chord correctly in its key', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'numeral-for-chord')) {
      const m = /In (\S+) (major|minor), which numeral is (\S+)\?/.exec(q.prompt)!;
      const chords = diatonicTriads(m[1], m[2] as 'major' | 'minor');
      const numerals = numeralsFor(m[2] as 'major' | 'minor');
      expect(q.answer[0]).toBe(numerals[chords.indexOf(m[3])]);
    }
  });

  it('names the chord each numeral stands for', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'chord-for-numeral')) {
      const m = /In (\S+) (major|minor), what chord is the (\S+)\?/.exec(q.prompt)!;
      const chords = diatonicTriads(m[1], m[2] as 'major' | 'minor');
      const numerals = numeralsFor(m[2] as 'major' | 'minor');
      expect(q.answer[0]).toBe(chords[numerals.indexOf(m[3])]);
    }
  });

  it('only ever calls a genuinely diatonic chord diatonic', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'pick-diatonic')) {
      const m = /belongs to (\S+) (major|minor)\?/.exec(q.prompt)!;
      const chords = diatonicTriads(m[1], m[2] as 'major' | 'minor');
      expect(chords).toContain(q.answer[0]);
      // And every distractor must really be outside the key.
      for (const c of q.choices!) {
        if (c.id !== q.answer[0]) expect(chords).not.toContain(c.id);
      }
    }
  });

  it('analyses a progression into the numerals that rebuild it', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'analyse-progression')) {
      const m = /In (\S+) (major|minor), analyse (.+)\.$/.exec(q.prompt)!;
      const numerals = q.answer[0].split(' – ');
      expect(fromRomanNumerals(m[1], numerals).join(' – ')).toBe(m[3]);
    }
  });

  it('builds the progression the numerals name', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'build-progression')) {
      const m = /Play (.+) in (\S+) (major|minor)\.$/.exec(q.prompt)!;
      expect(q.answer).toEqual(fromRomanNumerals(m[2], m[1].split(' – ')));
    }
  });

  it('gives the right borrowed chord, never a diatonic one', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'borrowed-chord')) {
      const m = /In (\S+) major, what chord is the (\S+)\?/.exec(q.prompt)!;
      expect(q.answer[0]).toBe(fromRomanNumerals(m[1], [m[2]])[0]);
      expect(diatonicTriads(m[1], 'major')).not.toContain(q.answer[0]);
    }
  });
});

describe('grading and feedback', () => {
  it('accepts the answer and explains a wrong one', () => {
    for (const q of sweep(4, 200)) {
      expect(grade(q, q.answer).correct).toBe(true);
      const wrong = q.choices?.find((c) => !q.answer.includes(c.id))?.id;
      if (wrong) {
        const g = grade(q, [wrong]);
        expect(g.correct).toBe(false);
        expect(g.diagnosis).toBeTruthy();
      }
    }
  });

  it('a build-progression with a decoy chord is wrong', () => {
    const q = sweep(4, 400).find((x) => x.typeId === 'build-progression' && x.pool!.length > x.answer.length)!;
    expect(q).toBeDefined();
    const decoy = q.pool!.find((c) => !q.answer.includes(c.id))!.id;
    expect(grade(q, [decoy, ...q.answer.slice(1)]).correct).toBe(false);
  });

  it('explains that a diatonic guess is not the borrowed chord', () => {
    const q = sweep(5, 500).find((x) => x.typeId === 'borrowed-chord')!;
    const tonic = /In (\S+) major/.exec(q.prompt)![1];
    const diatonicPick = q.choices!.find((c) => diatonicTriads(tonic, 'major').includes(c.id));
    if (diatonicPick) expect(grade(q, [diatonicPick.id]).diagnosis).toMatch(/diatonic|borrowed|flattened/i);
  });
});

describe('the prose reads like English', () => {
  it('never starts a sentence lowercase', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const q of sweep(tier, 200)) {
        for (const text of [q.prompt, q.rationale, q.context ?? '']) {
          for (const part of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
            expect(part[0]).toBe(part[0].toUpperCase());
          }
        }
      }
    }
  });
});

describe('difficulty', () => {
  it('stays in major until minor keys are earned', () => {
    expect(modesForTier(1)).toEqual(['major']);
    expect(modesForTier(2)).toEqual(['major']);
    expect(modesForTier(3)).toContain('minor');
  });

  it('works outward from the easy keys', () => {
    expect(keysForTier(1)).toEqual(['C', 'G', 'D', 'A']);
    expect(keysForTier(5).length).toBeGreaterThan(keysForTier(1).length);
  });

  it('saves function and borrowed chords for the later tiers', () => {
    const at = (t: number) => topic.types.filter((x) => x.minTier <= t).map((x) => x.id);
    expect(at(1)).not.toContain('chord-function');
    expect(at(1)).not.toContain('borrowed-chord');
    expect(at(4)).toContain('chord-function');
    expect(at(4)).toContain('borrowed-chord');
  });
});
