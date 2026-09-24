import type { BeatInfo } from '../audio/metronome';
import type { Chord } from '../music/chords';

/** One entry in the progression timeline: a chord held for `beats` beats. */
export interface ProgressionStep {
  chord: Chord;
  beats: number;
}

/** Snapshot of what the chord panel should display. */
export interface TrainerView {
  current: Chord | null;
  next: Chord | null;
  index: number;
  beatsPerChord: number; // duration of the current step, in beats
  beatsElapsed: number; // beats into the current step (0-based)
  beatsRemaining: number; // beats until the change
  isNewChord: boolean; // this beat is the first of a new step
  running: boolean;
}

/**
 * Drives a chord progression in time with the metronome. Each step has its own
 * duration in beats, so chords can change mid-measure (e.g. two 2-beat chords in
 * a 4/4 bar). It produces no sound — you play, it guides. The current step is
 * derived statelessly from the metronome's global beat counter, so it can never
 * drift out of sync with the click.
 */
export class ChordTrainer {
  private steps: ProgressionStep[] = [];
  private enabled = true;

  setProgression(steps: ProgressionStep[]): void {
    this.steps = steps;
  }
  getProgression(): ProgressionStep[] {
    return this.steps;
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  get active(): boolean {
    return this.enabled && this.steps.length > 0 && this.cycleBeats() > 0;
  }

  private cycleBeats(): number {
    return this.steps.reduce((sum, s) => sum + s.beats, 0);
  }

  /** Resolve a position (in beats within the cycle) to a step index + offset. */
  private locate(pos: number): { index: number; offset: number } {
    let acc = 0;
    for (let i = 0; i < this.steps.length; i++) {
      if (pos < acc + this.steps[i].beats) return { index: i, offset: pos - acc };
      acc += this.steps[i].beats;
    }
    return { index: this.steps.length - 1, offset: 0 };
  }

  private viewAt(pos: number, running: boolean): TrainerView {
    const { index, offset } = this.locate(pos);
    const step = this.steps[index];
    return {
      current: step.chord,
      next: this.steps[(index + 1) % this.steps.length].chord,
      index,
      beatsPerChord: step.beats,
      beatsElapsed: offset,
      beatsRemaining: step.beats - offset,
      isNewChord: offset === 0,
      running,
    };
  }

  /** Advance state for a metronome beat. Returns null when inactive. */
  handleBeat(info: BeatInfo): TrainerView | null {
    if (!this.active) return null;
    return this.viewAt(info.totalBeats % this.cycleBeats(), true);
  }

  /** Idle view (metronome stopped): sits at the start of the progression. */
  preview(): TrainerView | null {
    if (!this.active) return null;
    return this.viewAt(0, false);
  }
}
