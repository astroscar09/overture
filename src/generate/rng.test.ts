import { describe, expect, it } from 'vitest';
import { chance, int, makeRng, pick, sample, shuffle, weighted } from './rng';

describe('makeRng', () => {
  it('is deterministic: the same seed replays the same stream', () => {
    const a = Array.from({ length: 20 }, makeRng(12345));
    const b = Array.from({ length: 20 }, makeRng(12345));
    expect(a).toEqual(b);
  });

  it('gives different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, makeRng(1));
    const b = Array.from({ length: 20 }, makeRng(2));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('spreads roughly evenly across ten buckets', () => {
    const rng = makeRng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[Math.floor(rng() * 10)]++;
    // Each bucket should hold ~10000; allow a generous 10% band.
    for (const b of buckets) expect(b).toBeGreaterThan(9000);
    for (const b of buckets) expect(b).toBeLessThan(11000);
  });
});

describe('int', () => {
  it('is inclusive at both ends and never escapes the range', () => {
    const rng = makeRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = int(rng, 2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('handles a single-value range', () => {
    expect(int(makeRng(1), 4, 4)).toBe(4);
  });

  it('rejects an inverted range rather than looping forever', () => {
    expect(() => int(makeRng(1), 5, 2)).toThrow(/empty range/);
  });
});

describe('pick / weighted / sample / shuffle', () => {
  it('pick only ever returns a member', () => {
    const rng = makeRng(11);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 500; i++) expect(items).toContain(pick(rng, items));
  });

  it('pick throws on an empty list instead of returning undefined', () => {
    expect(() => pick(makeRng(1), [])).toThrow(/empty/);
  });

  it('weighted never returns a zero-weight item', () => {
    const rng = makeRng(5);
    const items = [
      { item: 'never', weight: 0 },
      { item: 'always', weight: 1 },
    ];
    for (let i = 0; i < 1000; i++) expect(weighted(rng, items)).toBe('always');
  });

  it('weighted respects the ratio', () => {
    const rng = makeRng(42);
    let heavy = 0;
    for (let i = 0; i < 10000; i++) {
      if (weighted(rng, [{ item: 'h', weight: 3 }, { item: 'l', weight: 1 }]) === 'h') heavy++;
    }
    expect(heavy / 10000).toBeGreaterThan(0.72);
    expect(heavy / 10000).toBeLessThan(0.78);
  });

  it('shuffle keeps every element and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(makeRng(8), items);
    expect(out.slice().sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('sample returns distinct items and clamps to the pool size', () => {
    const out = sample(makeRng(4), ['a', 'b', 'c'], 10);
    expect(new Set(out).size).toBe(3);
  });

  it('chance(0) never fires and chance(1) always does', () => {
    const rng = makeRng(6);
    for (let i = 0; i < 200; i++) {
      expect(chance(rng, 0)).toBe(false);
      expect(chance(rng, 1)).toBe(true);
    }
  });
});
