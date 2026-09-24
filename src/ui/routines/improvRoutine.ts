import { BackingTrack, type CompStyle } from '../../audio/backing';
import { SUBDIVISIONS } from '../../audio/metronome';
import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import {
  IMPROV_PROGRESSIONS,
  chordLabel,
  improvKeyName,
  progressionSteps,
  rangeNotes,
  type ImprovProgression,
  type Tonality,
} from '../../music/improv';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { Stopwatch, formatTime } from '../../practice/stopwatch';
import { ChordTrainer } from '../../trainer/ChordTrainer';
import { el, inlineChk, labeled, option } from '../dom';
import type { PracticeDeps, Routine } from './types';

const WIDTHS = [3, 4, 5, 6];
const DEFAULT_FROM = 5;
const DEFAULT_WIDTH = 4;
const DEFAULT_BACKING = 'pop';
const NO_BACKING = 'none';
/** Attempts kept in the long-term log (localStorage). */
const LOG_LIMIT = 500;
/** Attempts held for the current visit to the Practice tab. */
const VIEW_LIMIT = 50;
const SHOWN_ATTEMPTS = 10;

interface Attempt {
  date: string; // ISO timestamp
  ms: number;
  keyPc: number;
  tonality: Tonality;
  from: number;
  to: number;
  subdivision: number;
  bpm: number;
  backing: string;
}

const subdivisionName = (n: number) => SUBDIVISIONS.find(([value]) => value === n)?.[1] ?? `${n} per beat`;
const rangeLabel = (from: number, to: number) => `${from === 0 ? 'open' : from}–${to}`;

function selectEl(): HTMLSelectElement {
  const s = document.createElement('select');
  s.className = 'select';
  return s;
}

/**
 * Routine: pick a key and a small fret range, choose a subdivision, then
 * improvise over a backing progression (and/or a drone) without breaking the
 * subdivision for as long as you can. The timer is the score.
 */
export function createImprovRoutine(deps: PracticeDeps): Routine {
  const { fretboard, metronome, drone, state, startTransport, stopTransport, setSubdivision } = deps;

  // Its own trainer + backing so it never fights the Chord Trainer tab's settings.
  const trainer = new ChordTrainer();
  const backing = new BackingTrack();
  backing.setEnabled(true);
  const stopwatch = new Stopwatch();
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let attempts: Attempt[] = [];
  let active = false;
  let playing = false;
  let rafId: number | null = null;

  // ---- Key + range ----
  const keySelect = selectEl();
  const tonalitySelect = selectEl();
  tonalitySelect.append(option('major', 'Major'), option('minor', 'Natural minor'));
  const fromSelect = selectEl();
  const widthSelect = selectEl();
  widthSelect.append(...WIDTHS.map((w) => option(String(w), `${w} frets`)));
  widthSelect.value = String(DEFAULT_WIDTH);
  const randomBtn = el('button', { class: 'btn', type: 'button' }, ['Random key & range']);

  // ---- Groove ----
  const subdivisionSelect = selectEl();
  subdivisionSelect.append(...SUBDIVISIONS.map(([n, label]) => option(String(n), label)));
  const backingSelect = selectEl();
  const compSelect = selectEl();
  compSelect.append(option('sustained', 'Sustained'), option('strummed', 'Strummed'));
  const bassChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  bassChk.checked = true;
  const backingVol = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    value: '0.6',
    class: 'bpm-slider',
  }) as HTMLInputElement;
  const droneChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const fifthChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const droneVol = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    value: '0.5',
    class: 'bpm-slider',
  }) as HTMLInputElement;

  // ---- Run ----
  const infoEl = el('div', { class: 'now-key' });
  const statusEl = el('div', { class: 'now-detail' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const timerBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);
  const attemptsEl = el('div', { class: 'practice-history hidden' });

  // Setup is locked while a run is going so the score stays meaningful.
  const setupControls = [keySelect, tonalitySelect, fromSelect, widthSelect, randomBtn, subdivisionSelect, backingSelect];

  const tonality = () => tonalitySelect.value as Tonality;
  const keyPc = () => Number(keySelect.value);
  const fromFret = () => Number(fromSelect.value);
  const toFret = () => fromFret() + Number(widthSelect.value) - 1;
  const progression = (): ImprovProgression | null =>
    IMPROV_PROGRESSIONS[tonality()].find((p) => p.id === backingSelect.value) ?? null;

  const fillKeys = () => {
    const value = keySelect.value || '0';
    keySelect.replaceChildren(
      ...Array.from({ length: 12 }, (_, pc) => option(String(pc), improvKeyName(pc, tonality()))),
    );
    keySelect.value = value;
  };

  // Start-fret choices keep the whole range on the (15-fret) neck.
  const fillFrom = (value: number) => {
    const max = DEFAULT_FRETS - Number(widthSelect.value) + 1;
    fromSelect.replaceChildren(
      ...Array.from({ length: max + 1 }, (_, f) => option(String(f), f === 0 ? 'Open' : String(f))),
    );
    fromSelect.value = String(Math.max(0, Math.min(value, max)));
  };

  // Progression labels show the actual chords in the chosen key.
  const fillBacking = () => {
    const value = backingSelect.value || DEFAULT_BACKING;
    backingSelect.replaceChildren(
      option(NO_BACKING, 'None (click / drone only)'),
      ...IMPROV_PROGRESSIONS[tonality()].map((p) =>
        option(p.id, `${p.name} · ${p.chords.map((c) => chordLabel(keyPc(), tonality(), c)).join(' ')}`),
      ),
    );
    backingSelect.value = value;
  };

  const drawNeck = () => {
    if (!active) return;
    fretboard.setMode('pattern');
    fretboard.setPattern({
      notes: rangeNotes(keyPc(), tonality(), state.tuning.openMidi, fromFret(), toFret()),
      rootPc: keyPc(),
    });
  };

  // ---- Rendering ----
  const renderAttempts = () => {
    attemptsEl.classList.toggle('hidden', attempts.length === 0);
    if (!attempts.length) return;
    const best = attempts.reduce((a, b) => (b.ms > a.ms ? b : a));
    const header = el(
      'tr',
      {},
      ['Held', 'Key', 'Frets', 'Subdivision', 'BPM', 'Backing', 'When'].map((h) => el('th', {}, [h])),
    );
    const rows = attempts.slice(0, SHOWN_ATTEMPTS).map((a) => {
      const row = el('tr', {}, [
        el('td', {}, [formatTime(a.ms)]),
        el('td', {}, [`${improvKeyName(a.keyPc, a.tonality)} ${a.tonality}`]),
        el('td', {}, [rangeLabel(a.from, a.to)]),
        el('td', {}, [subdivisionName(a.subdivision)]),
        el('td', {}, [String(a.bpm)]),
        el('td', {}, [a.backing]),
        el('td', {}, [new Date(a.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]),
      ]);
      if (a === best) row.classList.add('best');
      return row;
    });
    attemptsEl.replaceChildren(
      el('div', { class: 'summary-head' }, [
        `Longest hold: ${formatTime(best.ms)} · ${improvKeyName(best.keyPc, best.tonality)} ${best.tonality}, ` +
          `${subdivisionName(best.subdivision).toLowerCase()} at ${best.bpm} BPM`,
      ]),
      el('span', { class: 'field-label' }, ['Recent attempts']),
      el('div', { class: 'table-scroll' }, [
        el('table', { class: 'summary-table' }, [el('thead', {}, [header]), el('tbody', {}, rows)]),
      ]),
    );
  };

  const render = () => {
    infoEl.textContent =
      `${improvKeyName(keyPc(), tonality())} ${tonality() === 'major' ? 'major' : 'minor'} · ` +
      `frets ${rangeLabel(fromFret(), toFret())}`;
    if (!playing) {
      statusEl.textContent =
        stopwatch.elapsed() > 0
          ? `Held for ${formatTime(stopwatch.elapsed())}. Start again to beat it.`
          : 'Press Start, then keep the subdivision going for as long as you can.';
    }
    readout.textContent = formatTime(stopwatch.elapsed());
    timerBtn.textContent = playing ? 'Stop' : 'Start';
    timerBtn.classList.toggle('is-running', playing);
    for (const control of setupControls) control.disabled = playing;
    renderAttempts();
  };

  // A new key/range/backing is a fresh attempt.
  const applySelection = () => {
    stopwatch.reset();
    fillBacking();
    drawNeck();
    render();
  };

  tonalitySelect.addEventListener('change', () => {
    fillKeys();
    applySelection();
  });
  keySelect.addEventListener('change', applySelection);
  fromSelect.addEventListener('change', applySelection);
  backingSelect.addEventListener('change', applySelection);
  widthSelect.addEventListener('change', () => {
    fillFrom(fromFret());
    applySelection();
  });
  randomBtn.addEventListener('click', () => {
    keySelect.value = String(Math.floor(Math.random() * 12));
    const maxFrom = DEFAULT_FRETS - Number(widthSelect.value) + 1;
    fillFrom(Math.floor(Math.random() * (maxFrom + 1)));
    applySelection();
  });

  subdivisionSelect.addEventListener('change', () => setSubdivision(Number(subdivisionSelect.value)));
  compSelect.addEventListener('change', () => backing.setStyle(compSelect.value as CompStyle));
  bassChk.addEventListener('change', () => backing.setBass(bassChk.checked));
  backingVol.addEventListener('input', () => backing.setVolume(Number(backingVol.value)));
  droneChk.addEventListener('change', () => {
    if (!droneChk.checked) drone.stop();
    else if (playing) void drone.start(keyPc());
  });
  fifthChk.addEventListener('change', () => drone.setFifth(fifthChk.checked));
  droneVol.addEventListener('input', () => drone.setVolume(Number(droneVol.value)));

  // ---- Beat clock: backing on the audio clock, bar/chord readout on the frame ----
  metronome.onBeatAudio((info, time) => {
    if (!playing) return;
    const view = trainer.handleBeat(info);
    if (view) backing.play(view, info, time, metronome.getBpm());
  });
  metronome.onBeat((info) => {
    if (!playing) return;
    const p = progression();
    const view = trainer.handleBeat(info);
    const chord = p && view ? ` · ${chordLabel(keyPc(), tonality(), p.chords[view.index])}` : '';
    statusEl.textContent = `Bar ${info.bar + 1}${chord}`;
  });

  // ---- Run ----
  const tick = () => {
    readout.textContent = formatTime(stopwatch.elapsed());
    rafId = stopwatch.running ? requestAnimationFrame(tick) : null;
  };

  // Stop sounds + timer (the click is left to the caller).
  const endRun = () => {
    stopwatch.stop();
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    playing = false;
    drone.stop();
  };

  const startRun = async () => {
    if (playing) return;
    const p = progression();
    trainer.setProgression(p ? progressionSteps(keyPc(), p, state.beatsPerMeasure) : []);
    backing.setStyle(compSelect.value as CompStyle);
    backing.setBass(bassChk.checked);
    backing.setVolume(Number(backingVol.value));
    stopwatch.reset();
    stopwatch.start();
    playing = true;
    statusEl.textContent = 'Bar 1';
    render();
    tick();
    if (droneChk.checked) {
      drone.setFifth(fifthChk.checked);
      drone.setVolume(Number(droneVol.value));
      void drone.start(keyPc());
    }
    // Restart the click so the progression begins on bar 1.
    stopTransport();
    await startTransport();
  };

  const stopRun = () => {
    if (!playing) return;
    const ms = stopwatch.elapsed();
    endRun();
    stopTransport();
    const attempt: Attempt = {
      date: new Date().toISOString(),
      ms,
      keyPc: keyPc(),
      tonality: tonality(),
      from: fromFret(),
      to: toFret(),
      subdivision: metronome.getSubdivision(),
      bpm: state.bpm,
      backing: progression()?.name ?? 'None',
    };
    attempts = [attempt, ...attempts].slice(0, VIEW_LIMIT);
    appendToLog(LOG_KEYS.improv, attempt, LOG_LIMIT);
    render();
  };

  timerBtn.addEventListener('click', () => (playing ? stopRun() : void startRun()));

  // ---- Assemble ----
  const element = el('div', { class: 'routine-body' }, [
    el('div', { class: 'grid-hint' }, [
      'Pick a key and a small range of frets, then improvise using only the notes lit up on the neck. ' +
        'Choose a subdivision and keep it going without a break for as long as you can. The timer is your score.',
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled('Key', keySelect),
      labeled('Scale', tonalitySelect),
      labeled('From fret', fromSelect),
      labeled('Range', widthSelect),
      randomBtn,
    ]),
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [infoEl, statusEl]),
      el('div', { class: 'practice-timer' }, [readout, timerBtn]),
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled('Subdivision', subdivisionSelect),
      labeled('Backing', backingSelect),
      labeled('Comp', compSelect),
      inlineChk(bassChk, 'Bass'),
      labeled('Backing volume', backingVol),
    ]),
    el('div', { class: 'backing-row' }, [
      inlineChk(droneChk, 'Drone on the key'),
      inlineChk(fifthChk, 'Add 5th'),
      labeled('Drone volume', droneVol),
    ]),
    attemptsEl,
  ]);

  fillKeys();
  fillFrom(DEFAULT_FROM);
  fillBacking();
  subdivisionSelect.value = String(metronome.getSubdivision());
  render();

  return {
    id: 'improv',
    name: 'Improv · key, range & subdivision',
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      subdivisionSelect.value = String(metronome.getSubdivision());
      drawNeck();
      render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      if (playing) {
        endRun();
        stopwatch.reset(); // abandoned, not scored
      }
      fretboard.setPattern(null);
      render();
    },
    refresh: drawNeck,
    clearHistory() {
      if (attempts.length === 0) return;
      attempts = [];
      renderAttempts();
    },
    syncTransport() {
      subdivisionSelect.value = String(metronome.getSubdivision());
    },
  };
}
