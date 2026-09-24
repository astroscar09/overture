import * as Tone from 'tone';
import { noteName } from '../music/notes';
import { ensureAudio } from './engine';

/**
 * A sustained drone on the key centre (root around C3–B3, optional 5th) to
 * practise scales against. It sounds until stopped and retunes on key changes.
 */
export class Drone {
  private out: Tone.Gain;
  private synth: Tone.PolySynth;
  private rootPc: number | null = null; // sounding root, null when silent
  private fifth = false;

  constructor() {
    this.out = new Tone.Gain(0.5).toDestination();
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 12 },
      envelope: { attack: 0.8, decay: 0.3, sustain: 0.9, release: 1.2 },
    }).connect(this.out);
    this.synth.volume.value = -10;
  }

  get playing(): boolean {
    return this.rootPc !== null;
  }

  private voicing(rootPc: number): string[] {
    const base = 48 + rootPc; // C3 = MIDI 48
    return this.fifth ? [noteName(base), noteName(base + 7)] : [noteName(base)];
  }

  private sound(rootPc: number): void {
    const now = Tone.now();
    this.synth.releaseAll(now);
    this.rootPc = rootPc;
    this.synth.triggerAttack(this.voicing(rootPc), now + 0.05);
  }

  async start(rootPc: number): Promise<void> {
    await ensureAudio();
    if (this.rootPc !== rootPc) this.sound(rootPc);
  }

  stop(): void {
    if (this.rootPc === null) return;
    this.synth.releaseAll();
    this.rootPc = null;
  }

  /** Retune to a new root if the drone is sounding. */
  setRoot(rootPc: number): void {
    if (this.rootPc !== null && this.rootPc !== rootPc) this.sound(rootPc);
  }

  setFifth(on: boolean): void {
    this.fifth = on;
    if (this.rootPc !== null) this.sound(this.rootPc);
  }

  setVolume(v: number): void {
    this.out.gain.rampTo(Math.max(0, Math.min(1, v)), 0.05);
  }
}
