import * as Tone from 'tone';
import { ensureAudio } from './engine';

// A plucked-string voice for exercise playback and ear training.
//
// The triangle PolySynth that previews fretboard clicks is fine for a single
// note, but a run of thirty-seconds through it sounds like a test tone. This
// is still synthesis rather than samples — Tone's Karplus-Strong string model,
// which costs nothing to download and behaves like a plucked string: the
// attack has a pick in it and the note decays on its own.
//
// Kept apart from the metronome and the backing track so exercise playback can
// be balanced, muted and disposed without touching either.

export class GuitarVoice {
  private out: Tone.Gain;
  private strings: Tone.PluckSynth[];
  private next = 0;
  private ready = false;

  /** One synth per string, so overlapping ring-out does not cut itself off. */
  constructor(voices = 6) {
    this.out = new Tone.Gain(0.8).toDestination();
    this.strings = Array.from({ length: voices }, () =>
      new Tone.PluckSynth({
        attackNoise: 1.2,
        dampening: 3200,
        resonance: 0.96,
        release: 0.6,
      }).connect(this.out),
    );
  }

  async prepare(): Promise<void> {
    if (this.ready) return;
    await ensureAudio();
    this.ready = true;
  }

  /**
   * Pluck a note at an exact transport time. `time` comes from the audio
   * clock, not from a timer, so playback stays locked to the click.
   *
   * `picked` controls how much pick noise is in the attack: a hammer-on or a
   * pull-off is sounded by the fretting hand alone, so it starts softer.
   */
  pluck(note: string, time: number, picked = true): void {
    const synth = this.strings[this.next % this.strings.length];
    this.next += 1;
    synth.attackNoise = picked ? 1.3 : 0.4;
    synth.triggerAttack(note, time);
  }

  setVolume(value: number): void {
    this.out.gain.rampTo(Math.max(0, Math.min(1, value)), 0.05);
  }

  /** Stop everything immediately — used when a loop is cut short. */
  silence(): void {
    const now = Tone.now();
    for (const synth of this.strings) synth.triggerRelease(now);
  }

  dispose(): void {
    for (const synth of this.strings) synth.dispose();
    this.out.dispose();
  }
}
