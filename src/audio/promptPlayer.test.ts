import { describe, expect, it } from 'vitest';
import { makeRng } from '../generate/rng';
import { EAR_TOPICS } from '../exercises/ear';
import { generateQuestion } from '../exercises/types';
import { DEFAULT_NOTE_LENGTH, NOTE_LENGTHS, PromptPlayer, noteLengthById } from './promptPlayer';

const topic = (id: string) => EAR_TOPICS.find((t) => t.id === id)!;
const question = (id: string, tier = 4, seed = 1) => generateQuestion(topic(id), tier, makeRng(seed));

describe('note lengths', () => {
  it('runs from short to held, each slower than the last', () => {
    expect(NOTE_LENGTHS.map((l) => l.id)).toEqual(['short', 'medium', 'long', 'held']);
    for (let i = 1; i < NOTE_LENGTHS.length; i++) {
      expect(NOTE_LENGTHS[i].bpm).toBeLessThan(NOTE_LENGTHS[i - 1].bpm);
    }
  });

  it('falls back to medium for an unknown id', () => {
    expect(noteLengthById('nonsense').id).toBe('medium');
    expect(noteLengthById(DEFAULT_NOTE_LENGTH).id).toBe('medium');
  });
});

describe('stretching a prompt', () => {
  it('makes an interval take longer at every step', () => {
    const q = question('ear-intervals', 2);
    const times = NOTE_LENGTHS.map((l) => PromptPlayer.duration(q.audio!, l.id));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('holds each note of an interval for a usable time', () => {
    // "Held" should give a note that really rings, not a blip.
    const q = question('ear-intervals', 1);
    expect(PromptPlayer.duration(q.audio!, 'held')).toBeGreaterThan(3);
    expect(PromptPlayer.duration(q.audio!, 'short')).toBeLessThan(1.5);
  });

  it('keeps the shape: a chord stays a chord however long the setting', () => {
    const q = question('ear-chords', 1);
    const notes = q.audio!.notes;
    // The chord's notes all start within a strum of each other, and stretching
    // the prompt must not pull them apart into an arpeggio.
    for (const id of NOTE_LENGTHS.map((l) => l.id)) {
      const seconds = 60 / noteLengthById(id).bpm / 480;
      const spread = (Math.max(...notes.map((n) => n.start)) - Math.min(...notes.map((n) => n.start))) * seconds;
      expect(spread).toBeLessThan(0.25);
    }
  });

  it('keeps a scale run proportionally faster than an interval', () => {
    const scale = question('ear-scales', 1);
    const interval = question('ear-intervals', 1);
    const perNote = (q: typeof scale) => PromptPlayer.duration(q.audio!, 'long') / q.audio!.notes.length;
    expect(perNote(scale)).toBeLessThan(perNote(interval));
  });

  it('gives a hear-and-find phrase room at the longer settings', () => {
    const q = question('ear-fretboard', 5);
    const short = PromptPlayer.duration(q.audio!, 'short');
    const held = PromptPlayer.duration(q.audio!, 'held');
    expect(held / short).toBeGreaterThan(3);
  });

  it('reports a sensible duration for every ear question at every length', () => {
    for (const t of EAR_TOPICS) {
      for (let tier = 1; tier <= 5; tier++) {
        for (let seed = 1; seed <= 10; seed++) {
          const q = generateQuestion(t, tier, makeRng(seed));
          for (const l of NOTE_LENGTHS) {
            const d = PromptPlayer.duration(q.audio!, l.id);
            expect(d).toBeGreaterThan(0);
            // Nothing should take more than half a minute to play.
            expect(d).toBeLessThan(30);
          }
        }
      }
    }
  });
});
