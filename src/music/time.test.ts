import { describe, expect, it } from 'vitest';
import {
  FOUR_FOUR,
  PPQ,
  barOf,
  barTicks,
  beatOf,
  beatTicks,
  isOnBeat,
  isStrongBeat,
  noteTicks,
  tickInBar,
  tickSeconds,
  ticksToValue,
  tupletTicks,
  type TimeSignature,
} from './time';

const THREE_FOUR: TimeSignature = { beats: 3, unit: 4 };
const SIX_EIGHT: TimeSignature = { beats: 6, unit: 8 };

describe('note values', () => {
  it('maps plain values to ticks', () => {
    expect(noteTicks(4)).toBe(480);
    expect(noteTicks(8)).toBe(240);
    expect(noteTicks(16)).toBe(120);
    expect(noteTicks(32)).toBe(60);
    expect(noteTicks(1)).toBe(1920);
  });

  it('handles dots', () => {
    expect(noteTicks(4, 1)).toBe(720);
    expect(noteTicks(8, 1)).toBe(360);
    expect(noteTicks(4, 2)).toBe(840);
  });

  it('round-trips through ticksToValue', () => {
    for (const value of [1, 2, 4, 8, 16, 32] as const) {
      for (const dots of [0, 1]) {
        expect(ticksToValue(noteTicks(value, dots))).toEqual({ value, dots });
      }
    }
  });

  it('returns null for a duration that is not a plain note value', () => {
    expect(ticksToValue(noteTicks(8) + 7)).toBeNull();
    expect(ticksToValue(tupletTicks(8, 3, 2))).toBeNull(); // a triplet eighth
  });
});

describe('tuplets', () => {
  it('fits three eighths into the space of two', () => {
    const t = tupletTicks(8, 3, 2);
    expect(t).toBe(160);
    expect(t * 3).toBe(noteTicks(4)); // a full beat
  });

  it('fits a sextuplet into one beat', () => {
    expect(tupletTicks(16, 6, 4)).toBe(80);
    expect(tupletTicks(16, 6, 4) * 6).toBe(noteTicks(4));
  });

  it('refuses a tuplet that would need fractional ticks', () => {
    expect(() => tupletTicks(64, 7, 4)).toThrow(/divide evenly/);
  });
});

describe('bars and beats', () => {
  it('sizes bars by signature', () => {
    expect(barTicks(FOUR_FOUR)).toBe(1920);
    expect(barTicks(THREE_FOUR)).toBe(1440);
    expect(beatTicks(SIX_EIGHT)).toBe(240);
    expect(barTicks(SIX_EIGHT)).toBe(1440);
  });

  it('locates a position', () => {
    expect(barOf(0, FOUR_FOUR)).toBe(0);
    expect(barOf(1919, FOUR_FOUR)).toBe(0);
    expect(barOf(1920, FOUR_FOUR)).toBe(1);
    expect(beatOf(1920 + 480, FOUR_FOUR)).toBe(1);
    expect(tickInBar(1920 + 240, FOUR_FOUR)).toBe(240);
  });

  it('knows what lands on a beat', () => {
    expect(isOnBeat(0, FOUR_FOUR)).toBe(true);
    expect(isOnBeat(480, FOUR_FOUR)).toBe(true);
    expect(isOnBeat(240, FOUR_FOUR)).toBe(false);
  });

  it('marks 1 and 3 strong in four, 1 in three, 1 and 4 in six', () => {
    expect([0, 480, 960, 1440].map((t) => isStrongBeat(t, FOUR_FOUR))).toEqual([true, false, true, false]);
    expect([0, 480, 960].map((t) => isStrongBeat(t, THREE_FOUR))).toEqual([true, false, false]);
    expect([0, 240, 480, 720].map((t) => isStrongBeat(t, SIX_EIGHT))).toEqual([true, false, false, true]);
    expect(isStrongBeat(120, FOUR_FOUR)).toBe(false); // off the beat entirely
  });
});

describe('tempo', () => {
  it('converts ticks to seconds', () => {
    // At 120bpm a quarter note is 0.5s, and a quarter note is PPQ ticks.
    expect(tickSeconds(120) * PPQ).toBeCloseTo(0.5, 10);
    expect(tickSeconds(60) * PPQ).toBeCloseTo(1.0, 10);
  });
});
