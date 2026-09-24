import { STANDARD, type Tuning } from './music/tuning';

// Lightweight shared defaults for v1. As features grow this can become a
// proper observable store; for now the wired modules hold their own refs.
export interface AppState {
  bpm: number;
  beatsPerMeasure: number;
  tuning: Tuning;
}

export const state: AppState = {
  bpm: 100,
  beatsPerMeasure: 4,
  tuning: STANDARD,
};
