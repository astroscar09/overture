import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

interface S { a: number; b: string }

describe('createStore', () => {
  it('holds and patches state', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    expect(s.get()).toEqual({ a: 1, b: 'x' });
    s.set({ a: 2 });
    expect(s.get()).toEqual({ a: 2, b: 'x' });
  });

  it('does not let callers mutate the held state through the initial object', () => {
    const initial = { a: 1, b: 'x' };
    const s = createStore<S>(initial);
    initial.a = 99;
    expect(s.get().a).toBe(1);
  });

  it('notifies subscribers with next and previous', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const seen: [S, S][] = [];
    s.subscribe((next, prev) => seen.push([{ ...next }, { ...prev }]));
    s.set({ a: 2 });
    expect(seen).toHaveLength(1);
    expect(seen[0][0].a).toBe(2);
    expect(seen[0][1].a).toBe(1);
  });

  it('stays quiet when a patch changes nothing', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ a: 1 });
    s.set({});
    expect(fn).not.toHaveBeenCalled();
    s.set({ a: 1, b: 'y' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ a: 2 });
    off();
    s.set({ a: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one subscriber throws', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    s.subscribe(() => { throw new Error('boom'); });
    s.subscribe(good);
    s.set({ a: 2 });
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('is not confused by a subscriber that unsubscribes mid-notify', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const second = vi.fn();
    const off = s.subscribe(() => off());
    s.subscribe(second);
    expect(() => s.set({ a: 2 })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('resets wholesale', () => {
    const s = createStore<S>({ a: 1, b: 'x' });
    const fn = vi.fn();
    s.subscribe(fn);
    s.reset({ a: 9, b: 'z' });
    expect(s.get()).toEqual({ a: 9, b: 'z' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
