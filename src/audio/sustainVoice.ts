import * as Tone from 'tone';
import { ensureAudio } from './engine';

// A tone that holds for exactly as long as it is asked to.
//
// Ear training needs a different voice from technique playback. The plucked
// string in guitar.ts is right for a run of sixteenths — it has a pick in the
// attack and dies away like a real note — but it physically cannot sustain,
// so asking it to "hold for three seconds" only adds silence after it has
// already decayed. Hearing an interval properly means hearing both pitches
// ring long enough to compare them, which takes an envelope that sustains.

export class SustainVoice {
  private out: Tone.Gain;
  private synth: Tone.PolySynth;
  private ready = false;

  constructor() {
    this.out = new Tone.Gain(0.55).toDestination();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 14 },
      envelope: { attack: 0.012, decay: 0.25, sustain: 0.85, release: 0.45 },
    }).connect(this.out);
    this.synth.volume.value = -9;
  }

  async prepare(): Promise<void> {
    if (this.ready) return;
    await ensureAudio();
    this.ready = true;
  }

  /** Sound a note for an exact length, at an exact time on the audio clock. */
  play(note: string, durationSeconds: number, time: number): void {
    this.synth.triggerAttackRelease(note, Math.max(0.05, durationSeconds), time);
  }

  setVolume(value: number): void {
    this.out.gain.rampTo(Math.max(0, Math.min(1, value)), 0.05);
  }

  /** Cut everything off — when a prompt is replaced mid-play. */
  silence(): void {
    this.synth.releaseAll(Tone.now());
  }

  dispose(): void {
    this.synth.dispose();
    this.out.dispose();
  }
}
