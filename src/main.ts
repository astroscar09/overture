// Self-hosted so the app keeps its type offline and never waits on a font CDN.
// Latin subsets only, and only the weights the UI actually uses.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './ui/styles.css';
import { DEFAULT_FRETS, Fretboard } from './fretboard/Fretboard';
import { Metronome } from './audio/metronome';
import { Drone } from './audio/drone';
import { createControls } from './ui/controls';
import { createChordPanel } from './ui/chordPanel';
import { ChordTrainer } from './trainer/ChordTrainer';
import { BackingTrack } from './audio/backing';
import { playChord } from './audio/engine';
import { chordNotes } from './music/chords';
import { installLogConsoleApi } from './practice/history';
import { createProgressLog } from './practice/progress';
import { state } from './state';

const transportEl = document.getElementById('transport');
const fretboardPanel = document.getElementById('fretboard-panel');
const controlsPanel = document.getElementById('controls-panel');
if (!transportEl || !fretboardPanel || !controlsPanel) {
  throw new Error('Missing #transport, #fretboard-panel or #controls-panel in index.html');
}

// The Now/Next chord panel sits directly above the neck and is shown only on
// the Chord Trainer tab (visibility is managed by createControls).
const chordPanelEl = document.createElement('section');
chordPanelEl.id = 'chord-panel';
chordPanelEl.setAttribute('aria-label', 'Chord trainer');
chordPanelEl.classList.add('hidden');
fretboardPanel.before(chordPanelEl);

// Lets the practice log be read from the browser console as `overture.read()`.
installLogConsoleApi();

// One append-only record of everything practised. Existing per-routine logs are
// folded in once, so nothing recorded before today is lost.
const progress = createProgressLog();
progress.backfillFromRoutineLogs();

const fretboard = new Fretboard(fretboardPanel, state.tuning, DEFAULT_FRETS);

const metronome = new Metronome();
metronome.setBpm(state.bpm);
metronome.setBeatsPerMeasure(state.beatsPerMeasure);

const trainer = new ChordTrainer();
const backing = new BackingTrack();
const drone = new Drone();

const updateChordPanel = createChordPanel(chordPanelEl, {
  onPlayChord: (chord) => void playChord(chordNotes(chord, state.tuning)),
});

createControls(controlsPanel, {
  metronome,
  fretboard,
  trainer,
  backing,
  drone,
  chordPanel: updateChordPanel,
  chordPanelEl,
  transportEl,
  state,
  progress,
});
