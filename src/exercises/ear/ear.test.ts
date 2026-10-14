import { describe, expect, it } from 'vitest';
import { makeRng } from '../../generate/rng';
import { semitones, spell, type IntervalName } from '../../music/theory/intervals';
import { STANDARD } from '../../music/tuning';
import { generateQuestion, grade, type TheoryQuestion, type TheoryTopic } from '../types';
import { EAR_TOPICS } from './index';
import { intervalsForTier } from './intervals';
import { QUALITIES, qualitiesForTier } from './chords';
import { SCALES, scaleRun, scalesForTier } from './scales';
import { phraseLengthForTier, windowForTier } from './fretboard';

const sweep = (topic: TheoryTopic, tier: number, seeds = 200): TheoryQuestion[] =>
  Array.from({ length: seeds }, (_, i) => generateQuestion(topic, tier, makeRng(i + 1)));

const byId = (id: string): TheoryTopic => EAR_TOPICS.find((t) => t.id === id)!;

describe('every ear question is well formed', () => {
  for (const topic of EAR_TOPICS) {
    for (let tier = 1; tier <= 5; tier++) {
      it(`${topic.id} tier ${tier}`, () => {
        for (const q of sweep(topic, tier, 120)) {
          expect(q.topicId).toBe(topic.id);
          expect(q.prompt.length).toBeGreaterThan(5);
          expect(q.rationale.length).toBeGreaterThan(5);
          // Every ear question must have something to hear.
          expect(q.audio).toBeDefined();
          expect(q.audio!.notes.length).toBeGreaterThan(0);
          expect(q.audio!.label.length).toBeGreaterThan(0);
          for (const n of q.audio!.notes) {
            // Inside a range a guitar can actually produce.
            expect(n.midi).toBeGreaterThanOrEqual(40);
            expect(n.midi).toBeLessThanOrEqual(88);
            expect(n.dur).toBeGreaterThan(0);
            expect(Number.isInteger(n.start)).toBe(true);
          }
          if (q.choices) {
            expect(q.choices).toHaveLength(4);
            expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
            expect(q.choices.filter((c) => q.answer.includes(c.id))).toHaveLength(1);
          }
        }
      });
    }
  }

  it('is deterministic from a seed', () => {
    const data = (q: TheoryQuestion) => JSON.parse(JSON.stringify(q));
    for (const topic of EAR_TOPICS) {
      expect(data(generateQuestion(topic, 4, makeRng(11)))).toEqual(data(generateQuestion(topic, 4, makeRng(11))));
    }
  });
});

describe('hearing intervals', () => {
  const topic = byId('ear-intervals');

  it('plays exactly the interval it asks about', () => {
    for (const q of sweep(topic, 5, 400)) {
      const notes = q.audio!.notes;
      expect(notes).toHaveLength(2);
      const gap = Math.abs(notes[1].midi - notes[0].midi);
      const named = (['1P','2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[])
        .find((i) => spell(i) === q.answer[0])!;
      expect(gap).toBe(semitones(named));
    }
  });

  it('plays a melodic interval in sequence and a harmonic one together', () => {
    for (const q of sweep(topic, 5, 400)) {
      const [a, b] = q.audio!.notes;
      if (q.typeId === 'hear-together') expect(Math.abs(b.start - a.start)).toBeLessThan(60);
      else expect(b.start).toBeGreaterThan(a.start + 60);
    }
  });

  it('plays descending questions with the higher note first', () => {
    for (const q of sweep(topic, 5, 400).filter((x) => x.typeId === 'hear-down')) {
      const [a, b] = q.audio!.notes;
      expect(a.midi).toBeGreaterThan(b.midi);
    }
  });

  it('holds the easy intervals back for the easy tiers', () => {
    expect(intervalsForTier(1)).toEqual(['3M', '5P', '8P']);
    expect(intervalsForTier(5)).toContain('4A');
    expect(topic.types.filter((t) => t.minTier <= 1).map((t) => t.id)).toEqual(['hear-up']);
  });
});

describe('hearing chords', () => {
  const topic = byId('ear-chords');

  it('plays the chord it names', () => {
    for (const q of sweep(topic, 5, 400).filter((x) => x.typeId === 'hear-quality')) {
      const quality = QUALITIES.find((x) => x.name === q.answer[0])!;
      const midis = q.audio!.notes.map((n) => n.midi);
      const root = Math.min(...midis);
      expect(midis.map((m) => m - root).sort((a, b) => a - b)).toEqual(quality.tones);
    }
  });

  it('plays the chord, then the one tone it is asking about', () => {
    for (const q of sweep(topic, 5, 400).filter((x) => x.typeId === 'which-tone-sounded')) {
      const notes = q.audio!.notes;
      const quality = QUALITIES.find((x) => q.prompt.includes(`A ${x.name} chord`))!;
      const chord = notes.slice(0, quality.tones.length);
      const single = notes[notes.length - 1];
      // The single note comes after the chord has sounded, and belongs to it.
      expect(single.start).toBeGreaterThan(chord[chord.length - 1].start);
      expect(chord.map((n) => n.midi)).toContain(single.midi);
      // And it is the degree the answer claims.
      const root = Math.min(...chord.map((n) => n.midi));
      const index = quality.tones.indexOf(single.midi - root);
      expect(quality.degrees[index]).toBe(q.answer[0]);
    }
  });

  it('never asks you to identify the root, which is a different task', () => {
    for (const q of sweep(topic, 5, 400).filter((x) => x.typeId === 'which-tone-sounded')) {
      expect(q.answer[0]).not.toBe('the root');
    }
  });

  it('starts with major against minor', () => {
    expect(qualitiesForTier(1).map((q) => q.id)).toEqual(['maj', 'min']);
    expect(qualitiesForTier(5).length).toBeGreaterThan(5);
  });
});

describe('hearing scales', () => {
  const topic = byId('ear-scales');

  it('builds a run that starts and ends on the root', () => {
    for (const id of SCALES.map((s) => s.id)) {
      const run = scaleRun(60, id);
      expect(run[0]).toBe(60);
      expect(run[run.length - 1]).toBe(72);
      // Strictly ascending, no repeats.
      for (let i = 1; i < run.length; i++) expect(run[i]).toBeGreaterThan(run[i - 1]);
    }
  });

  it('gives the pentatonics five notes and the modes seven', () => {
    expect(scaleRun(60, 'minor pentatonic')).toHaveLength(6);
    expect(scaleRun(60, 'blues')).toHaveLength(7);
    expect(scaleRun(60, 'aeolian')).toHaveLength(8);
    expect(scaleRun(60, 'harmonic minor')).toHaveLength(8);
  });

  it('plays the scale it names', () => {
    for (const q of sweep(topic, 5, 400)) {
      const scale = SCALES.find((s) => s.name === q.answer[0])!;
      const played = q.audio!.notes.map((n) => n.midi);
      const ascending = [...played].sort((a, b) => a - b);
      expect(ascending).toEqual(scaleRun(ascending[0], scale.id));
    }
  });

  it('only plays downward at the higher tiers', () => {
    const lower = sweep(topic, 2, 300);
    for (const q of lower) {
      const m = q.audio!.notes.map((n) => n.midi);
      expect(m[0]).toBeLessThan(m[m.length - 1]);
    }
    expect(scalesForTier(1).map((s) => s.id)).toEqual(['major', 'aeolian']);
  });
});

describe('hear it, then find it', () => {
  const topic = byId('ear-fretboard');

  it('plays one note early on and a phrase later', () => {
    expect(phraseLengthForTier(1)).toBe(1);
    expect(phraseLengthForTier(3)).toBe(2);
    expect(phraseLengthForTier(5)).toBe(3);
    for (const tier of [1, 3, 5]) {
      for (const q of sweep(topic, tier, 60)) {
        expect(q.audio!.notes).toHaveLength(phraseLengthForTier(tier));
      }
    }
  });

  it('grades the pitch, not the fingering', () => {
    for (const q of sweep(topic, 1, 200)) {
      expect(q.fretboardAnswer).toBe('pitch');
      expect(q.answer).toEqual(q.audio!.notes.map((n) => String(n.midi)));
      // Any string/fret pair that sounds that pitch must be accepted.
      const target = q.audio!.notes[0].midi;
      expect(grade(q, [String(target)]).correct).toBe(true);
      expect(grade(q, [String(target + 1)]).correct).toBe(false);
    }
  });

  it('wants the phrase back in order', () => {
    const q = sweep(topic, 5, 200).find((x) => x.answer.length === 3)!;
    expect(q.matching).toBe('ordered');
    expect(grade(q, q.answer).correct).toBe(true);
    expect(grade(q, [...q.answer].reverse()).correct).toBe(false);
    expect(grade(q, q.answer.slice(0, 2)).correct).toBe(false);
  });

  it('keeps every note playable inside the stated window', () => {
    for (const tier of [1, 3, 5]) {
      const [lo, hi] = windowForTier(tier);
      for (const q of sweep(topic, tier, 120)) {
        for (const note of q.audio!.notes) {
          const reachable = STANDARD.openMidi.some((open) => {
            const fret = note.midi - open;
            return fret >= lo && fret <= hi;
          });
          expect(reachable).toBe(true);
        }
        for (const t of q.fretboard!.targets) {
          expect(t.fret).toBeGreaterThanOrEqual(lo);
          expect(t.fret).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('marks an anchor without marking the answer', () => {
    for (const q of sweep(topic, 2, 200)) {
      expect(q.fretboard!.marks.length).toBeGreaterThan(0);
      const answerPitches = new Set(q.answer);
      for (const m of q.fretboard!.marks) {
        const midi = STANDARD.openMidi[m.string] + m.fret;
        // The anchor may coincide with the answer by chance, but it must not
        // be labelled with anything that gives the pitch away.
        expect(m.label).not.toMatch(/^\d+$/);
        void answerPitches.has(String(midi));
      }
    }
  });
});

describe('grading and feedback', () => {
  it('accepts the answer and explains a wrong one', () => {
    for (const topic of EAR_TOPICS) {
      for (const q of sweep(topic, 4, 120)) {
        const right = q.matching === 'any' ? [q.answer[0]] : q.answer;
        expect(grade(q, right).correct).toBe(true);
        const wrong = q.choices?.find((c) => !q.answer.includes(c.id))?.id;
        if (wrong) {
          const g = grade(q, [wrong]);
          expect(g.correct).toBe(false);
          expect(g.rationale.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('reads like English', () => {
    for (const topic of EAR_TOPICS) {
      for (const q of sweep(topic, 5, 120)) {
        for (const text of [q.prompt, q.rationale, q.context ?? '']) {
          for (const part of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
            expect(part[0]).toBe(part[0].toUpperCase());
          }
        }
        expect(q.prompt).not.toMatch(/\ba (augmented|octave)\b/);
      }
    }
  });
});
