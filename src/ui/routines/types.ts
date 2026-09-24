import type { Drone } from '../../audio/drone';
import type { Metronome } from '../../audio/metronome';
import type { Fretboard } from '../../fretboard/Fretboard';
import type { AppState } from '../../state';

/** Shared app pieces every practice routine can use. */
export interface PracticeDeps {
  fretboard: Fretboard;
  metronome: Metronome;
  drone: Drone;
  state: AppState;
  /** Start / stop the shared transport (keeps the top-bar Start button in sync). */
  startTransport: () => Promise<void>;
  stopTransport: () => void;
  /** Set the click subdivision (keeps the top-bar picker in sync). */
  setSubdivision: (n: number) => void;
}

/** One practice routine shown on the Practice tab. */
export interface Routine {
  id: string;
  name: string;
  element: HTMLElement;
  /** The routine became visible: take over the neck. */
  activate(): void;
  /** The routine was hidden: abandon any running attempt and hand the neck back. */
  deactivate(): void;
  /** Redraw the neck (after something else touched it). */
  refresh(): void;
  /**
   * The Practice tab itself closed: forget the on-screen session list. The
   * long-term log in localStorage is untouched. Switching routines within the
   * tab does NOT trigger this.
   */
  clearHistory?(): void;
  /** The shared transport settings changed elsewhere. */
  syncTransport?(): void;
}
