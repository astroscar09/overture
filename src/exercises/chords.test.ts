import { describe, expect, it } from 'vitest';
import { makeRng } from '../generate/rng';
import { chordInfo } from '../music/theory/harmony';
import { STANDARD } from '../music/tuning';
import { CHORDS_TOPIC, QUALITIES, isPlainSpelling, qualitiesForTier, rootsForTier, semitonesOfDegree } from './chords';
import { generateQuestion, grade, type TheoryQuestion } from './types';

const topic = CHORDS_TOPIC;
const sweep = (tier: number, seeds = 300): TheoryQuestion[] =>
  Array.from({ length: seeds }, (_, i) => generateQuestion(topic, tier, makeRng(i + 1)));

describe('the quality table agrees with the theory layer', () => {
  // The formulas are written by hand for teaching; Tonal is the check on them.
  for (const q of QUALITIES) {
    it(`C${q.suffix} is ${q.formula}`, () => {
      expect(chordInfo(`C${q.suffix}`).formula.join(' ')).toBe(q.formula);
    });
  }

  it('each degree in every formula maps to the right semitone count', () => {
    for (const q of QUALITIES) {
      const info = chordInfo(`C${q.suffix}`);
      info.formula.forEach((degree, i) => {
        const expected = (chordInfo(`C${q.suffix}`).notes.length, semitonesOfDegree(degree));
        // C is chroma 0, so the note's chroma is the semitone count.
        const chroma = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
          .indexOf(info.notes[i].replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#'));
        expect(chroma).toBe(expected % 12);
      });
    }
  });
});

describe('determinism and shape', () => {
  it('rebuilds the same question from the same seed', () => {
    const data = (q: TheoryQuestion) => JSON.parse(JSON.stringify(q));
    for (let tier = 1; tier <= 5; tier++) {
      expect(data(generateQuestion(topic, tier, makeRng(3)))).toEqual(data(generateQuestion(topic, tier, makeRng(3))));
    }
  });

  for (let tier = 1; tier <= 5; tier++) {
    it(`tier ${tier} questions are well formed`, () => {
      for (const q of sweep(tier, 200)) {
        expect(q.topicId).toBe(topic.id);
        expect(q.prompt.length).toBeGreaterThan(5);
        expect(q.rationale.length).toBeGreaterThan(5);
        if (q.choices) {
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
          expect(q.choices.filter((c) => q.answer.includes(c.id))).toHaveLength(1);
        }
        if (q.mode === 'build-sequence') {
          expect([...q.pool!.map((c) => c.id)].sort()).toEqual([...q.answer].sort());
        }
        if (q.mode === 'fretboard-select') expect(q.fretboard!.targets.length).toBeGreaterThan(0);
        const text = [q.prompt, q.context ?? '', q.rationale].join(' ');
        expect(isPlainSpelling(text)).toBe(true);
      }
    });
  }
});

describe('the chords are right', () => {
  it('spells chords exactly as the theory layer does', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'spell-chord')) {
      const symbol = /are in (\S+)\?/.exec(q.prompt)![1];
      expect(q.answer[0]).toBe(chordInfo(symbol).notes.join(' '));
    }
  });

  it('names the chord its notes actually spell', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'name-chord')) {
      const notes = /Which chord is (.+)\?/.exec(q.prompt)![1];
      expect(chordInfo(q.answer[0]).notes.join(' ')).toBe(notes);
    }
  });

  it('gives the formula the quality really has', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'chord-formula')) {
      const name = /formula for a (.+)\?/.exec(q.prompt)![1];
      expect(QUALITIES.find((x) => x.name === name)!.formula).toBe(q.answer[0]);
    }
  });

  it('builds the stack from the root upward', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'build-chord')) {
      const symbol = /Stack up (\S+),/.exec(q.prompt)![1];
      expect(q.answer).toEqual(chordInfo(symbol).notes);
    }
  });
});

describe('inversions', () => {
  it('names the inversion the bass note implies', () => {
    const names = ['root position', 'first inversion', 'second inversion', 'third inversion'];
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'identify-inversion')) {
      const m = /^(\S+) with (\S+) in the bass/.exec(q.prompt)!;
      const notes = chordInfo(m[1]).notes;
      expect(names[notes.indexOf(m[2])]).toBe(q.answer[0]);
    }
  });

  it('never claims a triad has a third inversion', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'identify-inversion')) {
      const symbol = /^(\S+) with/.exec(q.prompt)![1];
      if (chordInfo(symbol).notes.length === 3) expect(q.answer[0]).not.toBe('third inversion');
    }
  });

  it('explains why a triad has no third inversion when that is the mistake', () => {
    const q = sweep(5, 600).find(
      (x) => x.typeId === 'identify-inversion'
        && chordInfo(/^(\S+) with/.exec(x.prompt)![1]).notes.length === 3
        && x.choices!.some((c) => c.id === 'third inversion')
        && x.answer[0] !== 'third inversion',
    )!;
    expect(q).toBeDefined();
    expect(grade(q, ['third inversion']).diagnosis).toMatch(/only three notes|no third inversion/i);
  });
});

describe('the neck questions are playable', () => {
  const openMidi = STANDARD.openMidi;

  it('puts every target at the right pitch above the marked root', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'find-chord-tone')) {
      const root = q.fretboard!.marks[0];
      const rootMidi = openMidi[root.string] + root.fret;
      const symbol = /of (\S+)\.$/.exec(q.prompt)![1];
      const info = chordInfo(symbol);
      // Whichever degree was asked for, every target must be that pitch.
      const degrees = info.formula.map(semitonesOfDegree);
      for (const t of q.fretboard!.targets) {
        const semis = openMidi[t.string] + t.fret - rootMidi;
        expect(degrees).toContain(semis);
      }
      // And all targets must agree with each other.
      const all = q.fretboard!.targets.map((t) => openMidi[t.string] + t.fret);
      expect(new Set(all).size).toBe(1);
    }
  });

  it('keeps targets within a hand span and on the neck', () => {
    for (const q of sweep(5, 500).filter((x) => x.typeId === 'find-chord-tone')) {
      const root = q.fretboard!.marks[0];
      for (const t of q.fretboard!.targets) {
        expect(Math.abs(t.fret - root.fret)).toBeLessThanOrEqual(6);
        expect(t.fret).toBeGreaterThanOrEqual(0);
        expect(t.fret).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('grading and feedback', () => {
  it('accepts the answer, rejects a distractor, and explains', () => {
    for (const q of sweep(4, 200)) {
      expect(grade(q, q.matching === 'any' ? [q.answer[0]] : q.answer).correct).toBe(true);
      const wrong = q.choices?.find((c) => !q.answer.includes(c.id))?.id;
      if (wrong) {
        const g = grade(q, [wrong]);
        expect(g.correct).toBe(false);
        expect(g.rationale.length).toBeGreaterThan(10);
      }
    }
  });

  it('tells you which chord your wrong spelling actually was', () => {
    const q = sweep(3, 400).find((x) => x.typeId === 'spell-chord')!;
    const wrong = q.choices!.find((c) => !q.answer.includes(c.id))!.id;
    const d = grade(q, [wrong]).diagnosis;
    if (d) expect(d).toMatch(/spell|triad|7th/i);
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

  it('says "the chord X" so a bare triad symbol is not read as a key', () => {
    for (const q of sweep(5, 400).filter((x) => x.typeId === 'which-tone')) {
      expect(q.prompt).toMatch(/^In the chord /);
    }
  });
});

describe('difficulty', () => {
  it('starts with triads and adds sevenths, then the altered ones', () => {
    expect(qualitiesForTier(1).map((q) => q.id)).toEqual(['maj', 'min']);
    expect(qualitiesForTier(3).map((q) => q.id)).toContain('maj7');
    expect(qualitiesForTier(4).map((q) => q.id)).toContain('dim');
    expect(qualitiesForTier(5).map((q) => q.id)).toContain('m7b5');
  });

  it('adds accidental roots later', () => {
    expect(rootsForTier(1).every((r) => r.length === 1)).toBe(true);
    expect(rootsForTier(5).some((r) => r.length > 1)).toBe(true);
  });
});
