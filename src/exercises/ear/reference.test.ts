import { describe, expect, it } from 'vitest';
import { semitones, spell, type IntervalName } from '../../music/theory/intervals';
import { INTERVAL_REFERENCE, confusableWith, referenceFor } from './reference';

describe('the interval reference', () => {
  it('covers every interval inside an octave', () => {
    expect(INTERVAL_REFERENCE).toHaveLength(14);
    const spans = INTERVAL_REFERENCE.map((r) => r.semitones);
    // Every distance from unison to octave is represented at least once.
    for (let n = 0; n <= 12; n++) expect(spans).toContain(n);
  });

  it('is in ascending order', () => {
    for (let i = 1; i < INTERVAL_REFERENCE.length; i++) {
      expect(INTERVAL_REFERENCE[i].semitones).toBeGreaterThanOrEqual(INTERVAL_REFERENCE[i - 1].semitones);
    }
  });

  it('agrees with the theory layer on names and distances', () => {
    for (const r of INTERVAL_REFERENCE) {
      expect(r.name).toBe(spell(r.interval));
      expect(r.semitones).toBe(semitones(r.interval));
    }
  });

  it('describes every one, and gets the fret count right in the text', () => {
    for (const r of INTERVAL_REFERENCE) {
      expect(r.blurb.length).toBeGreaterThan(30);
      // A semitone is a fret, so any fret count mentioned must match.
      const claimed = /(\b\w+) fret/.exec(r.blurb);
      const words: Record<string, number> = {
        One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6,
        Seven: 7, Eight: 8, Nine: 9, Ten: 10, Eleven: 11, Twelve: 12,
      };
      if (claimed && words[claimed[1]] !== undefined) expect(words[claimed[1]]).toBe(r.semitones);
    }
  });

  it('spells the tritone both ways, at the same distance', () => {
    const aug4 = referenceFor('4A');
    const dim5 = referenceFor('5d');
    expect(aug4.semitones).toBe(6);
    expect(dim5.semitones).toBe(6);
    expect(aug4.blurb).not.toBe(dim5.blurb);
  });

  it('throws for an interval it does not know', () => {
    expect(() => referenceFor('13M' as IntervalName)).toThrow(/No reference/);
  });
});

describe('what each interval is confused with', () => {
  it('offers a different interval for every one', () => {
    for (const r of INTERVAL_REFERENCE) {
      const other = confusableWith(r.interval);
      expect(other).not.toBe(r.interval);
      expect(() => referenceFor(other)).not.toThrow();
    }
  });

  it('pairs the ones that actually take work to tell apart', () => {
    // A third against the other third, a fourth against the tritone.
    expect(confusableWith('3m')).toBe('3M');
    expect(confusableWith('3M')).toBe('3m');
    expect(confusableWith('6m')).toBe('6M');
    expect(confusableWith('7m')).toBe('7M');
    expect(confusableWith('4P')).toBe('4A');
  });

  it('never pairs an interval with one more than two semitones away', () => {
    for (const r of INTERVAL_REFERENCE) {
      const gap = Math.abs(semitones(confusableWith(r.interval)) - r.semitones);
      expect(gap).toBeLessThanOrEqual(2);
    }
  });
});
