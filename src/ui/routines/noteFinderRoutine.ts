import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import { playNote } from '../../audio/engine';
import {
  NOTE_POOLS,
  drillNoteName,
  pitchClassSpots,
  spotsLabel,
  stringLabel,
  type NotePool,
  type Spot,
} from '../../music/noteDrill';
import { noteName, type PitchClass } from '../../music/notes';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { ShuffleBag } from '../../practice/shuffleBag';
import { Stopwatch, formatTime } from '../../practice/stopwatch';
import { el, inlineChk, labeled, option, selectEl } from '../dom';
import type { PracticeDeps, Routine } from './types';

/** Fret limits offered for the search area. */
const FRET_LIMITS = [5, 12, DEFAULT_FRETS];
const DEFAULT_LIMIT = 12;
const ANY_STRING = 'any';
/** Bars per note when the click drives the drill. */
const AUTO_BARS = [1, 2, 4];
const DEFAULT_AUTO_BARS = 2;
/** Runs kept in the long-term log (localStorage). */
const LOG_LIMIT = 500;
/** Runs held for the current visit to the Practice tab. */
const VIEW_LIMIT = 50;
const SHOWN_RUNS = 10;
/** Octave the reference pitch is played in (C4 = middle C). */
const HEAR_OCTAVE_MIDI = 60;

interface Run {
  date: string; // ISO timestamp
  ms: number; // whole run
  count: number; // notes found
  avgMs: number;
  pool: string;
  strings: string;
  maxFret: number;
  auto: number | null; // bars per note, null when self-paced
}

const perNote = (ms: number, count: number) => (count > 0 ? ms / count : 0);

/**
 * Routine: a random note is called out and you find it on the neck, which is
 * drawn blank so nothing gives the answer away. "Next" calls another note and
 * keeps going for as long as you like — the pool reshuffles itself rather than
 * stopping after 12, and the same note never comes up twice in a row.
 */
export function createNoteFinderRoutine(deps: PracticeDeps): Routine {
  const { fretboard, metronome, state, startTransport, stopTransport } = deps;

  const stopwatch = new Stopwatch();
  const bag = new ShuffleBag<PitchClass>([]);
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let runs: Run[] = [];
  let active = false;
  let running = false;
  let revealed = false;
  let currentPc: PitchClass | null = null;
  /** performance.now() when the current note was called. */
  let calledAt = 0;
  /** Milliseconds spent on each note found so far this run. */
  let times: number[] = [];
  let rafId: number | null = null;
  /** Bar the last auto-advance happened on, so a slower setting still lines up. */
  let lastAutoBar = 0;

  // ---- Setup ----
  const poolSelect = selectEl();
  poolSelect.append(...NOTE_POOLS.map((p) => option(p.id, p.name)));
  const stringSelect = selectEl();
  const fretSelect = selectEl();
  fretSelect.append(...FRET_LIMITS.map((f) => option(String(f), `Up to fret ${f}`)));
  fretSelect.value = String(DEFAULT_LIMIT);
  const autoChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const autoBarsSelect = selectEl();
  autoBarsSelect.append(...AUTO_BARS.map((b) => option(String(b), b === 1 ? 'every bar' : `every ${b} bars`)));
  autoBarsSelect.value = String(DEFAULT_AUTO_BARS);

  // ---- Prompt ----
  const noteEl = el('div', { class: 'drill-note' }, ['–']);
  const askEl = el('div', { class: 'now-detail' });
  const answerEl = el('div', { class: 'drill-answer' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const startBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);
  const nextBtn = el('button', { class: 'btn', type: 'button' }, ['Next note']);
  const revealBtn = el('button', { class: 'btn', type: 'button' }, ['Reveal']);
  const hearBtn = el('button', { class: 'btn', type: 'button' }, ['Hear it']);
  const statsEl = el('div', { class: 'drill-stats' });
  const runsEl = el('div', { class: 'practice-history hidden' });

  // Setup is locked while a run is going so the score means one thing.
  const setupControls = [poolSelect, stringSelect, fretSelect, autoChk, autoBarsSelect];

  const pool = (): NotePool => NOTE_POOLS.find((p) => p.id === poolSelect.value) ?? NOTE_POOLS[0];
  const maxFret = () => Number(fretSelect.value);
  const onlyString = (): number | null => (stringSelect.value === ANY_STRING ? null : Number(stringSelect.value));
  const autoBars = () => (autoChk.checked ? Number(autoBarsSelect.value) : null);
  const spotsFor = (pc: PitchClass): Spot[] =>
    pitchClassSpots(pc, state.tuning.openMidi, maxFret(), onlyString());

  const stringsLabel = () => {
    const only = onlyString();
    return only === null ? 'Any string' : stringLabel(only, state.tuning.openMidi);
  };

  const fillStrings = () => {
    const value = stringSelect.value || ANY_STRING;
    stringSelect.replaceChildren(
      option(ANY_STRING, 'Any string'),
      // Highest string first, so the list reads the way the neck is drawn.
      ...state.tuning.openMidi
        .map((_, i) => i)
        .reverse()
        .map((i) => option(String(i), stringLabel(i, state.tuning.openMidi))),
    );
    stringSelect.value = value;
  };

  /**
   * The notes worth asking for: with a single string and a short fret window,
   * some notes simply are not in the search area.
   */
  const askableNotes = (): PitchClass[] => pool().pitchClasses.filter((pc) => spotsFor(pc).length > 0);

  const refillBag = () => {
    bag.setItems(askableNotes());
    bag.reset();
  };

  // ---- Neck ----
  const drawNeck = () => {
    if (!active) return;
    if (!running || currentPc === null) {
      // Idle: the whole neck is on show as a reference.
      fretboard.setPattern(null);
      fretboard.setMode('all');
      return;
    }
    fretboard.setMode('pattern');
    // Blank until revealed — an empty pattern hides every node.
    fretboard.setPattern({ notes: revealed ? spotsFor(currentPc) : [], rootPc: currentPc });
  };

  // ---- Rendering ----
  const renderRuns = () => {
    runsEl.classList.toggle('hidden', runs.length === 0);
    if (!runs.length) return;
    // Best = fastest average, over runs long enough to mean something.
    const scored = runs.filter((r) => r.count >= 4);
    const best = scored.length ? scored.reduce((a, b) => (b.avgMs < a.avgMs ? b : a)) : null;
    const header = el(
      'tr',
      {},
      ['Notes', 'Per note', 'Total', 'Pool', 'Strings', 'Frets', 'Pace', 'When'].map((h) => el('th', {}, [h])),
    );
    const rows = runs.slice(0, SHOWN_RUNS).map((r) => {
      const row = el('tr', {}, [
        el('td', {}, [String(r.count)]),
        el('td', {}, [formatTime(r.avgMs)]),
        el('td', {}, [formatTime(r.ms)]),
        el('td', {}, [r.pool]),
        el('td', {}, [r.strings]),
        el('td', {}, [`0–${r.maxFret}`]),
        el('td', {}, [r.auto === null ? 'Self-paced' : `${r.auto} bar${r.auto === 1 ? '' : 's'}`]),
        el('td', {}, [new Date(r.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]),
      ]);
      if (r === best) row.classList.add('best');
      return row;
    });
    runsEl.replaceChildren(
      ...(best
        ? [el('div', { class: 'summary-head' }, [`Fastest: ${formatTime(best.avgMs)} per note over ${best.count} notes`])]
        : []),
      el('span', { class: 'field-label' }, ['Recent runs']),
      el('div', { class: 'table-scroll' }, [
        el('table', { class: 'summary-table' }, [el('thead', {}, [header]), el('tbody', {}, rows)]),
      ]),
    );
  };

  const renderStats = () => {
    const found = times.length;
    if (!running && found === 0) {
      statsEl.textContent = `${askableNotes().length} notes in the pool · ${stringsLabel().toLowerCase()}, frets 0–${maxFret()}`;
      return;
    }
    // Averaged over the notes actually found, so the one on screen does not
    // drag the number up while you are still looking for it.
    const banked = times.reduce((a, b) => a + b, 0);
    statsEl.textContent =
      `${found} note${found === 1 ? '' : 's'} found · ${formatTime(perNote(banked, found))} per note` +
      (found ? ` · fastest ${formatTime(Math.min(...times))}` : '') +
      ` · ${formatTime(stopwatch.elapsed())} total`;
  };

  const render = () => {
    noteEl.textContent = currentPc === null ? '–' : drillNoteName(currentPc);
    if (!running) {
      askEl.textContent =
        currentPc === null
          ? 'Press Start: a note is called and you find it on the neck.'
          : 'Run over. Press Start to go again.';
    } else {
      askEl.textContent =
        onlyString() === null
          ? 'Find it everywhere on the neck.'
          : `Find it on the ${stringsLabel()}.`;
    }
    if (revealed && currentPc !== null) {
      const spots = spotsFor(currentPc);
      answerEl.textContent =
        onlyString() === null
          ? `${spots.length} place${spots.length === 1 ? '' : 's'} on the neck (lit up)`
          : spotsLabel(spots, state.tuning.openMidi);
    } else {
      answerEl.textContent = '';
    }
    startBtn.textContent = running ? 'Stop' : 'Start';
    startBtn.classList.toggle('is-running', running);
    startBtn.disabled = !running && askableNotes().length === 0;
    nextBtn.disabled = !running;
    revealBtn.disabled = !running || revealed;
    hearBtn.disabled = currentPc === null;
    for (const control of setupControls) control.disabled = running;
    autoBarsSelect.disabled = running || !autoChk.checked;
    readout.textContent = formatTime(running ? performance.now() - calledAt : 0);
    renderStats();
    renderRuns();
  };

  // ---- Run ----
  const tick = () => {
    readout.textContent = formatTime(performance.now() - calledAt);
    renderStats();
    rafId = running ? requestAnimationFrame(tick) : null;
  };
  const cancelTick = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  /** Call the next note, banking the time spent on the one before it. */
  const callNote = (bank: boolean) => {
    if (bank && currentPc !== null) times.push(performance.now() - calledAt);
    const next = bag.next();
    if (next === null) return;
    currentPc = next;
    revealed = false;
    calledAt = performance.now();
    drawNeck();
    render();
  };

  const startRun = async () => {
    if (running) return;
    refillBag();
    if (bag.size === 0) return;
    times = [];
    stopwatch.reset();
    stopwatch.start();
    running = true;
    currentPc = null;
    lastAutoBar = 0;
    callNote(false);
    tick();
    if (autoBars() !== null) {
      // Restart the click so the first note gets a whole bar.
      stopTransport();
      await startTransport();
    }
  };

  const endRun = () => {
    running = false;
    stopwatch.stop();
    cancelTick();
  };

  const stopRun = () => {
    if (!running) return;
    const auto = autoBars();
    endRun();
    if (auto !== null) stopTransport();
    // The note on screen when you stopped was never found, so it is not scored.
    if (times.length > 0) {
      const ms = times.reduce((a, b) => a + b, 0);
      const run: Run = {
        date: new Date().toISOString(),
        ms,
        count: times.length,
        avgMs: perNote(ms, times.length),
        pool: pool().name,
        strings: stringsLabel(),
        maxFret: maxFret(),
        auto,
      };
      runs = [run, ...runs].slice(0, VIEW_LIMIT);
      appendToLog(LOG_KEYS.noteFinder, run, LOG_LIMIT);
    }
    drawNeck();
    render();
  };

  /** Abandon a run without scoring it (leaving the tab). */
  const abandonRun = () => {
    if (!running) return;
    const auto = autoBars();
    endRun();
    if (auto !== null) stopTransport();
    times = [];
    currentPc = null;
  };

  const reveal = () => {
    if (!running || currentPc === null) return;
    revealed = true;
    drawNeck();
    render();
  };

  // ---- Wiring ----
  startBtn.addEventListener('click', () => (running ? stopRun() : void startRun()));
  nextBtn.addEventListener('click', () => callNote(true));
  revealBtn.addEventListener('click', reveal);
  hearBtn.addEventListener('click', () => {
    if (currentPc !== null) void playNote(noteName(HEAR_OCTAVE_MIDI + currentPc), '4n');
  });

  const onSetupChange = () => {
    refillBag();
    render();
  };
  poolSelect.addEventListener('change', onSetupChange);
  stringSelect.addEventListener('change', onSetupChange);
  fretSelect.addEventListener('change', onSetupChange);
  autoChk.addEventListener('change', render);

  // Auto-advance rides the shared click: a new note every N bars.
  metronome.onBeat((info) => {
    const bars = autoBars();
    if (!running || bars === null || !info.isAccent) return;
    if (info.bar - lastAutoBar < bars) return;
    lastAutoBar = info.bar;
    callNote(true);
  });

  // ---- Assemble ----
  const element = el('div', { class: 'routine-body' }, [
    el('div', { class: 'grid-hint' }, [
      'A note is called out and the neck goes blank: find it, then reveal to check yourself. ' +
        'Next calls another note and the drill keeps going as long as you like — the pool reshuffles ' +
        'instead of stopping after 12, and you never get the same note twice in a row. ' +
        'Narrow it to one string to learn that string on its own.',
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled('Notes', poolSelect),
      labeled('Strings', stringSelect),
      labeled('Area', fretSelect),
      inlineChk(autoChk, 'Advance with the click'),
      labeled('Pace', autoBarsSelect),
    ]),
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [noteEl, askEl, answerEl]),
      el('div', { class: 'practice-timer' }, [readout, startBtn]),
    ]),
    el('div', { class: 'practice-actions' }, [nextBtn, revealBtn, hearBtn]),
    statsEl,
    runsEl,
  ]);

  fillStrings();
  refillBag();
  render();

  return {
    id: 'noteFinder',
    name: 'Note finder · random notes on the neck',
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      fillStrings(); // the tuning may have changed while away
      refillBag();
      drawNeck();
      render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      abandonRun();
      fretboard.setPattern(null);
      render();
    },
    refresh: drawNeck,
    clearHistory() {
      if (runs.length === 0) return;
      runs = [];
      renderRuns();
    },
  };
}
