import * as Tone from 'tone';
import { noteName } from '../music/notes';
import { barTicks, tickSeconds } from '../music/time';
import type { NoteEvent, Phrase } from '../generate/types';
import type { Metronome } from './metronome';
import { GuitarVoice } from './guitar';

// Plays a generated phrase in time with the click, and says which note is
// sounding so the tab can follow along.
//
// Scheduling goes on Tone's transport — the same one the metronome runs on —
// so the exercise and the click cannot drift apart. Visual callbacks come
// through Tone.Draw, which keeps the cursor on the note you are hearing
// rather than the one the main thread got round to.

export interface PhrasePlayerOptions {
  metronome: Metronome;
  /** Called with the index of the note now sounding, or null between loops. */
  onNote?: (index: number | null) => void;
  /** Called each time the phrase comes round again. */
  onLoop?: (count: number) => void;
}

export class PhrasePlayer {
  private voice = new GuitarVoice();
  private part: Tone.Part | null = null;
  private phrase: Phrase | null = null;
  private loops = 0;
  private running = false;

  constructor(private options: PhrasePlayerOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  get loopCount(): number {
    return this.loops;
  }

  setVolume(value: number): void {
    this.voice.setVolume(value);
  }

  /**
   * A bent note sounds at its target pitch. The written fret is what you play;
   * the bend is what the listener hears, so that is what gets plucked.
   */
  private soundingName(event: NoteEvent): string {
    return noteName(event.midi + (event.bend ?? 0));
  }

  /** Load a phrase. Safe to call while stopped; stops first if running. */
  load(phrase: Phrase): void {
    this.stop();
    this.phrase = phrase;
  }

  async start(bpm: number): Promise<void> {
    if (!this.phrase || this.running) return;
    await this.voice.prepare();

    const phrase = this.phrase;
    const seconds = tickSeconds(bpm, phrase.timeSig);
    const loopEnd = barTicks(phrase.timeSig) * phrase.bars * seconds;

    this.part = new Tone.Part((time, value: { index: number }) => {
      const event = phrase.events[value.index];
      this.voice.pluck(this.soundingName(event), time, event.attack === 'pick');
      Tone.getDraw().schedule(() => this.options.onNote?.(value.index), time);
      if (value.index === 0 && this.loops > 0) {
        const count = this.loops;
        Tone.getDraw().schedule(() => this.options.onLoop?.(count), time);
      }
      if (value.index === phrase.events.length - 1) this.loops += 1;
    }, phrase.events.map((e, index) => [e.start * seconds, { index }] as [number, { index: number }]));

    this.part.loop = true;
    this.part.loopStart = 0;
    this.part.loopEnd = loopEnd;
    this.loops = 0;
    this.running = true;
    // Start on the next bar line so the exercise enters with the click rather
    // than halfway through a beat.
    this.part.start(0);
    if (!this.options.metronome.running) await this.options.metronome.start();
  }

  stop(): void {
    if (this.part) {
      this.part.stop();
      this.part.dispose();
      this.part = null;
    }
    if (this.running) this.voice.silence();
    this.running = false;
    this.options.onNote?.(null);
  }

  dispose(): void {
    this.stop();
    this.voice.dispose();
  }
}
