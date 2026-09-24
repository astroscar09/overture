import * as Tone from 'tone';
import { ensureAudio } from './engine';

/** Everything a listener needs to react to a beat. */
export interface BeatInfo {
  beat: number; // 0-based position within the measure
  isAccent: boolean; // true on beat 0 (the downbeat)
  bar: number; // 0-based bar count since start
  totalBeats: number; // 0-based global beat count since start
  beatsPerMeasure: number;
}

/** Called once per beat, in sync with the audio, for visual feedback. */
export type BeatCallback = (info: BeatInfo) => void;

/** Click subdivisions: [clicks per beat, label]. */
export const SUBDIVISIONS: [number, string][] = [
  [1, 'Quarter notes'],
  [2, 'Eighth notes'],
  [3, 'Triplets'],
  [4, 'Sixteenth notes'],
  [6, 'Sixteenth triplets'],
];

/**
 * A metronome built on Tone.Transport. Timing is sample-accurate: clicks are
 * scheduled ahead on the audio clock rather than fired from setInterval, so it
 * does not drift. Visual callbacks are dispatched through Tone.Draw so the UI
 * flashes in step with what you hear.
 */
/** Audio-accurate beat callback (runs on the audio clock, gets the exact time). */
export type AudioBeatCallback = (info: BeatInfo, time: number) => void;

export class Metronome {
  private clickSynth: Tone.Synth;
  private subClickSynth: Tone.Synth;
  private scheduleId: number | null = null;
  private beatsPerMeasure = 4;
  private subdivision = 1; // clicks per beat: 1=off, 2=eighths, 3=triplets, 4=16ths, 6=sextuplets
  private currentBeat = 0;
  private clickMuted = false;
  private listeners = new Set<BeatCallback>();
  private audioListeners = new Set<AudioBeatCallback>();

  constructor() {
    this.clickSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
    }).toDestination();
    this.clickSynth.volume.value = -6;

    // Softer, higher tick for in-between subdivisions so the main beat stands out.
    this.subClickSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
    }).toDestination();
    this.subClickSynth.volume.value = -13;
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  getBpm(): number {
    return Tone.getTransport().bpm.value;
  }

  setBeatsPerMeasure(n: number): void {
    this.beatsPerMeasure = n;
  }

  /** Clicks per beat: 1 = quarter notes only, 2 = eighths, 3 = triplets, 4 = 16ths, 6 = sextuplets. */
  setSubdivision(n: number): void {
    this.subdivision = Math.max(1, Math.floor(n));
  }

  getSubdivision(): number {
    return this.subdivision;
  }

  setClickMuted(muted: boolean): void {
    this.clickMuted = muted;
  }

  /** Subscribe to beats for VISUAL updates (dispatched via Tone.Draw). */
  onBeat(cb: BeatCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Subscribe to beats for AUDIO (runs on the audio clock with the exact time). */
  onBeatAudio(cb: AudioBeatCallback): () => void {
    this.audioListeners.add(cb);
    return () => this.audioListeners.delete(cb);
  }

  get running(): boolean {
    return this.scheduleId !== null;
  }

  async start(): Promise<void> {
    await ensureAudio();
    if (this.scheduleId !== null) return;

    this.currentBeat = 0;
    const transport = Tone.getTransport();

    this.scheduleId = transport.scheduleRepeat((time) => {
      const total = this.currentBeat;
      const beat = total % this.beatsPerMeasure;
      const isAccent = beat === 0;
      // Accent beat 1 with a higher pitch and fuller velocity.
      if (!this.clickMuted) {
        const pitch = isAccent ? 'C6' : 'C5';
        this.clickSynth.triggerAttackRelease(pitch, '32n', time, isAccent ? 1 : 0.55);

        // Layer the in-between subdivision ticks across this beat, sample-accurate
        // off the same beat time so they stay locked to the click.
        if (this.subdivision > 1) {
          const beatDur = 60 / Tone.getTransport().bpm.value; // seconds per quarter-note beat
          const step = beatDur / this.subdivision;
          for (let i = 1; i < this.subdivision; i++) {
            this.subClickSynth.triggerAttackRelease('C6', '64n', time + i * step, 0.4);
          }
        }
      }

      const info: BeatInfo = {
        beat,
        isAccent,
        bar: Math.floor(total / this.beatsPerMeasure),
        totalBeats: total,
        beatsPerMeasure: this.beatsPerMeasure,
      };
      // Audio producers run on the audio clock at the exact time.
      for (const cb of this.audioListeners) cb(info, time);
      // Visual updates align to the frame via Tone.Draw.
      for (const cb of this.listeners) {
        Tone.getDraw().schedule(() => cb(info), time);
      }
      this.currentBeat++;
    }, '4n');

    transport.start();
  }

  stop(): void {
    const transport = Tone.getTransport();
    if (this.scheduleId !== null) {
      transport.clear(this.scheduleId);
      this.scheduleId = null;
    }
    transport.stop();
    this.currentBeat = 0;
  }

  toggle(): Promise<void> | void {
    return this.running ? this.stop() : this.start();
  }
}
