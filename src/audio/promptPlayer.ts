import * as Tone from 'tone';
import { tickSeconds } from '../music/time';
import { noteName } from '../music/notes';
import type { AudioPrompt } from '../exercises/types';
import { SustainVoice } from './sustainVoice';

// Plays an ear-training prompt once, on demand.
//
// Deliberately not on the transport. An ear-training question is a thing you
// ask to hear, not a thing that runs in tempo, so it is scheduled against the
// audio clock directly: the click can be running or stopped and neither
// interferes with the other.

/** How long each note is held. The prompt's own rhythm is preserved; this
 *  stretches the whole thing, so a chord stays a chord and a scale stays a
 *  scale — they just get more room. */
export interface NoteLength {
  id: string;
  name: string;
  /** The tempo the prompt's tick positions are read at. Lower is longer. */
  bpm: number;
}

export const NOTE_LENGTHS: NoteLength[] = [
  { id: 'short', name: 'Short', bpm: 132 },
  { id: 'medium', name: 'Medium', bpm: 84 },
  { id: 'long', name: 'Long', bpm: 52 },
  { id: 'held', name: 'Held', bpm: 34 },
];

export const DEFAULT_NOTE_LENGTH = 'medium';

export const noteLengthById = (id: string): NoteLength =>
  NOTE_LENGTHS.find((l) => l.id === id) ?? NOTE_LENGTHS[1];

const LENGTH_KEY = 'overture.ear.noteLength';

/** The remembered note length. Shared by every part of ear training. */
export function readNoteLength(): string {
  try {
    const stored = localStorage.getItem(LENGTH_KEY);
    return stored && NOTE_LENGTHS.some((l) => l.id === stored) ? stored : DEFAULT_NOTE_LENGTH;
  } catch {
    return DEFAULT_NOTE_LENGTH;
  }
}

export function writeNoteLength(id: string): void {
  try {
    localStorage.setItem(LENGTH_KEY, id);
  } catch {
    // Storage unavailable: the setting just will not survive a reload.
  }
}

export class PromptPlayer {
  private voice = new SustainVoice();

  /**
   * `lengthId` stretches the prompt without changing its shape. The notes keep
   * their relative durations, so the gap between the two notes of an interval
   * grows along with how long each one rings.
   */
  async play(prompt: AudioPrompt, lengthId: string = DEFAULT_NOTE_LENGTH): Promise<void> {
    await this.voice.prepare();
    this.voice.silence();
    const seconds = tickSeconds(noteLengthById(lengthId).bpm);
    const start = Tone.now() + 0.08; // a little headroom so nothing clips
    for (const note of prompt.notes) {
      this.voice.play(noteName(note.midi), note.dur * seconds, start + note.start * seconds);
    }
  }

  /** How long a prompt will take to play, in seconds. */
  static duration(prompt: AudioPrompt, lengthId: string = DEFAULT_NOTE_LENGTH): number {
    const seconds = tickSeconds(noteLengthById(lengthId).bpm);
    return Math.max(...prompt.notes.map((n) => n.start + n.dur)) * seconds;
  }

  stop(): void {
    this.voice.silence();
  }

  setVolume(value: number): void {
    this.voice.setVolume(value);
  }

  dispose(): void {
    this.voice.dispose();
  }
}
