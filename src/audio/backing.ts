import * as Tone from 'tone';
import { noteName } from '../music/notes';
import { parseChordName, type Quality } from '../music/chordShapes';
import type { BeatInfo } from './metronome';
import type { TrainerView } from '../trainer/ChordTrainer';

export type CompStyle = 'sustained' | 'strummed';

// Semitone offsets from the root for each chord quality.
const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dom7: [0, 4, 7, 10],
};

/** Mid-register chord voicing (~C3–B3) as note names, from root + quality. */
export function chordVoicing(rootPc: number, quality: Quality): string[] {
  const base = 48 + rootPc; // C3 = MIDI 48
  return INTERVALS[quality].map((i) => noteName(base + i));
}

/** Bass root, one octave low (C2–B2). */
export function bassNote(rootPc: number): string {
  return noteName(36 + rootPc); // C2 = MIDI 36
}

/**
 * Plays the chord progression out loud (chords + bass) so you can solo over it.
 * It produces sound on the audio clock at the exact scheduled beat time, riding
 * the same Tone.Transport as the metronome, so it stays locked and loops with
 * the bar grid. Chord tones come from root+quality, so they're correct in any
 * tuning.
 */
export class BackingTrack {
  private out: Tone.Gain;
  private chordSynth: Tone.PolySynth;
  private bassSynth: Tone.Synth;

  private enabled = false;
  private style: CompStyle = 'sustained';
  private bassOn = true;

  constructor() {
    this.out = new Tone.Gain(0.6).toDestination();

    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.6 },
    }).connect(this.out);
    this.chordSynth.volume.value = -11;

    this.bassSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 },
    }).connect(this.out);
    this.bassSynth.volume.value = -6;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  setStyle(style: CompStyle): void {
    this.style = style;
  }
  setBass(on: boolean): void {
    this.bassOn = on;
  }
  setVolume(v: number): void {
    this.out.gain.rampTo(Math.max(0, Math.min(1, v)), 0.05);
  }

  /** Produce sound for one beat at audio time `time`. Call from the beat clock. */
  play(view: TrainerView, info: BeatInfo, time: number, bpm: number): void {
    if (!this.enabled || !view.current) return;
    const { rootPc, quality } = parseChordName(view.current.name);
    const beatSec = 60 / bpm;
    const voicing = chordVoicing(rootPc, quality);

    if (this.style === 'sustained') {
      // One held hit at each chord change, ringing for the chord's duration.
      if (view.isNewChord) {
        const dur = view.beatsPerChord * beatSec * 0.98;
        this.chordSynth.triggerAttackRelease(voicing, dur, time);
        if (this.bassOn) this.bassSynth.triggerAttackRelease(bassNote(rootPc), dur, time);
      }
    } else {
      // Strum the chord on every beat; bass pulses on each beat too.
      const dur = beatSec * 0.9;
      voicing.forEach((n, i) => this.chordSynth.triggerAttackRelease(n, dur, time + i * 0.012));
      if (this.bassOn) this.bassSynth.triggerAttackRelease(bassNote(rootPc), beatSec * 0.85, time);
    }
    void info;
  }
}
