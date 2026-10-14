import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import {
  CIRCLE_DIRECTIONS,
  circleKeyNames,
  circleKeys,
  type CircleDirection,
  type CircleKey,
} from '../../music/circleOfFifths';
import { SCALES, scaleSpots } from '../../music/scales';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { Stopwatch, formatTime } from '../../practice/stopwatch';
import { createCircleWheel } from '../circleWheel';
import { el, inlineChk, labeled, option, selectEl } from '../dom';
import type { PracticeDeps, Routine } from './types';

const KEYS_PER_LAP = 12;
/** Fret-window widths offered, and the window the drill opens on. */
const WIDTHS = [3, 4, 5, 6];
const DEFAULT_WIDTH = 4;
const DEFAULT_FROM = 5;
/** Bars on each key when the click drives the cycle. */
const BARS_PER_KEY = [2, 4, 8, 16];
const DEFAULT_BARS = 8;
/** Runs kept in the long-term log (localStorage). */
const LOG_LIMIT = 500;
/** Runs held for the current visit to the Practice tab. */
const VIEW_LIMIT = 50;
const SHOWN_RUNS = 10;

interface Run {
  date: string; // ISO timestamp
  ms: number; // whole run
  keys: number; // keys played through
  laps: number;
  startKey: string;
  direction: string;
  scale: string;
  from: number;
  to: number;
  bars: number | null; // bars per key, null when self-paced
}

const perKey = (ms: number, keys: number) => (keys > 0 ? ms / keys : 0);
/** "Major (Ionian)" reads as a headline better as plain "major". */
const shortScale = (name: string) => name.replace(/\s*\(.*\)/, '').toLowerCase();
const rangeLabel = (from: number, to: number) => `${from === 0 ? 'open' : from}–${to}`;

/**
 * Routine: walk the circle of fifths inside one fret window. Pick where to
 * start (or let it drop you somewhere random), play the current key's scale
 * without leaving the window, and move round the circle — by the click or
 * whenever you are ready. The window never moves, so each new key is a new
 * shape under the same hand position.
 */
export function createCircleRoutine(deps: PracticeDeps): Routine {
  const { fretboard, metronome, drone, state, startTransport, stopTransport } = deps;

  const stopwatch = new Stopwatch();
  const wheel = createCircleWheel();
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let runs: Run[] = [];
  let active = false;
  let running = false;
  /** The twelve keys in playing order, from the key the run started on. */
  let keys: CircleKey[] = [];
  let index = 0;
  /** Keys finished this run (so a lap and a half still reads honestly). */
  let keysDone = 0;
  /** performance.now() when the current key came up. */
  let keyStartedAt = 0;
  let times: number[] = [];
  let rafId: number | null = null;
  /** Bar the current key started on, and the bar the click last reported. */
  let keyStartBar = 0;
  let currentBar = 0;

  // ---- Setup ----
  const startSelect = selectEl();
  const directionSelect = selectEl();
  directionSelect.append(...CIRCLE_DIRECTIONS.map((d) => option(d.id, d.name)));
  const scaleSelect = selectEl();
  scaleSelect.append(...Object.entries(SCALES).map(([id, scale]) => option(id, scale.name)));
  const fromSelect = selectEl();
  const widthSelect = selectEl();
  widthSelect.append(...WIDTHS.map((w) => option(String(w), `${w} frets`)));
  widthSelect.value = String(DEFAULT_WIDTH);
  const randomChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const showChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  showChk.checked = true;
  const autoChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  autoChk.checked = true;
  const barsSelect = selectEl();
  barsSelect.append(...BARS_PER_KEY.map((b) => option(String(b), `every ${b} bars`)));
  barsSelect.value = String(DEFAULT_BARS);

  // ---- Drone ----
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
  const keyEl = el('div', { class: 'drill-note' }, ['–']);
  const detailEl = el('div', { class: 'now-detail' });
  const nextEl = el('div', { class: 'now-detail next-key' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const startBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);
  const nextBtn = el('button', { class: 'btn', type: 'button' }, ['Next key']);
  const statsEl = el('div', { class: 'drill-stats' });
  const runsEl = el('div', { class: 'practice-history hidden' });

  // The circle itself is fixed while a run is going; the window and the neck
  // display are not, so you can shift position or hide the notes mid-run.
  const setupControls = [startSelect, directionSelect, randomChk, autoChk, barsSelect];

  const direction = () => directionSelect.value as CircleDirection;
  const scale = () => SCALES[scaleSelect.value] ?? SCALES.major;
  const startPc = () => Number(startSelect.value);
  const fromFret = () => Number(fromSelect.value);
  const toFret = () => fromFret() + Number(widthSelect.value) - 1;
  const barsPerKey = () => (autoChk.checked ? Number(barsSelect.value) : null);
  /**
   * What the routine is showing: the run's own sequence while it is going, and
   * otherwise whatever the settings say the next run will be — so stopping, or
   * changing the start key, leaves the wheel, the neck and the heading agreed.
   */
  const shownKeys = (): CircleKey[] => (running ? keys : circleKeys(startPc(), direction()));
  const shownIndex = () => (running ? index : 0);
  const currentKey = (): CircleKey | null => shownKeys()[shownIndex()] ?? null;
  const nextKeyOf = (): CircleKey | null => {
    const list = shownKeys();
    return list.length ? list[(shownIndex() + 1) % list.length] : null;
  };
  const lap = () => Math.floor(keysDone / KEYS_PER_LAP) + 1;

  // Start-key names follow the direction, so the flat side reads Gb not F#.
  const fillStartKeys = () => {
    const value = startSelect.value || '0';
    startSelect.replaceChildren(...circleKeyNames(direction()).map((k) => option(String(k.pc), k.name)));
    startSelect.value = value;
  };

  // Window choices keep the whole window on the neck.
  const fillFrom = (value: number) => {
    const max = DEFAULT_FRETS - Number(widthSelect.value) + 1;
    fromSelect.replaceChildren(
      ...Array.from({ length: max + 1 }, (_, f) => option(String(f), f === 0 ? 'Open' : String(f))),
    );
    fromSelect.value = String(Math.max(0, Math.min(value, max)));
  };

  // ---- Neck ----
  const drawNeck = () => {
    if (!active) return;
    const key = currentKey();
    fretboard.setMode('pattern');
    // Between runs this is the key you are about to start on, which is worth
    // seeing in the window; with the notes hidden it is blank either way.
    const shown = showChk.checked ? key : null;
    fretboard.setPattern(
      shown === null
        ? { notes: [], rootPc: key?.pc ?? 0 }
        : {
            notes: scaleSpots(shown.pc, scale(), state.tuning.openMidi, fromFret(), toFret()),
            rootPc: shown.pc,
          },
    );
  };

  // ---- Rendering ----
  const renderWheel = () => {
    wheel.update(shownKeys(), shownIndex(), direction(), lap(), running ? keysDone % KEYS_PER_LAP : 0);
  };

  const renderNext = () => {
    const next = nextKeyOf();
    const bars = barsPerKey();
    if (!running || next === null) {
      nextEl.textContent = '';
      nextEl.classList.remove('cue');
      return;
    }
    const barsLeft = bars === null ? null : Math.max(0, bars - (currentBar - keyStartBar));
    nextEl.textContent =
      `Next: ${next.name} ${shortScale(scale().name)}` +
      (barsLeft === null
        ? ' · press Next key when you are ready'
        : ` · changing in ${barsLeft} bar${barsLeft === 1 ? '' : 's'}`);
    nextEl.classList.toggle('cue', barsLeft !== null && barsLeft <= 1);
  };

  const renderStats = () => {
    if (!running && keysDone === 0) {
      statsEl.textContent =
        `${circleKeyNames(direction())
          .map((k) => k.name)
          .join(' → ')} → …`;
      return;
    }
    const banked = times.reduce((a, b) => a + b, 0);
    statsEl.textContent =
      `${keysDone} key${keysDone === 1 ? '' : 's'} played · lap ${lap()} · ` +
      (keysDone ? `${formatTime(perKey(banked, keysDone))} per key · ` : '') +
      `${formatTime(stopwatch.elapsed())} total`;
  };

  const renderRuns = () => {
    runsEl.classList.toggle('hidden', runs.length === 0);
    if (!runs.length) return;
    const best = runs.reduce((a, b) => (b.keys > a.keys ? b : a));
    const header = el(
      'tr',
      {},
      ['Keys', 'Total', 'Per key', 'From', 'Direction', 'Scale', 'Frets', 'Pace', 'When'].map((h) =>
        el('th', {}, [h]),
      ),
    );
    const rows = runs.slice(0, SHOWN_RUNS).map((r) => {
      const row = el('tr', {}, [
        el('td', {}, [`${r.keys}${r.laps > 1 ? ` (${r.laps} laps)` : ''}`]),
        el('td', {}, [formatTime(r.ms)]),
        el('td', {}, [formatTime(perKey(r.ms, r.keys))]),
        el('td', {}, [r.startKey]),
        el('td', {}, [r.direction]),
        el('td', {}, [r.scale]),
        el('td', {}, [rangeLabel(r.from, r.to)]),
        el('td', {}, [r.bars === null ? 'Self-paced' : `${r.bars} bars`]),
        el('td', {}, [new Date(r.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]),
      ]);
      if (r === best) row.classList.add('best');
      return row;
    });
    runsEl.replaceChildren(
      el('div', { class: 'summary-head' }, [
        `Furthest round: ${best.keys} key${best.keys === 1 ? '' : 's'} in ${formatTime(best.ms)}`,
      ]),
      el('span', { class: 'field-label' }, ['Recent runs']),
      el('div', { class: 'table-scroll' }, [
        el('table', { class: 'summary-table' }, [el('thead', {}, [header]), el('tbody', {}, rows)]),
      ]),
    );
  };

  const render = () => {
    const key = currentKey();
    keyEl.textContent = key === null ? '–' : `${key.name} ${shortScale(scale().name)}`;
    detailEl.textContent = running
      ? `Key ${(keysDone % KEYS_PER_LAP) + 1} of ${KEYS_PER_LAP} · frets ${rangeLabel(fromFret(), toFret())}` +
        (showChk.checked ? '' : ' · neck hidden, work the shape out yourself')
      : `Start on ${key?.name ?? 'C'} and go round by ${direction()}, staying in frets ${rangeLabel(fromFret(), toFret())}.`;
    startBtn.textContent = running ? 'Stop' : 'Start';
    startBtn.classList.toggle('is-running', running);
    nextBtn.disabled = !running;
    startSelect.disabled = running || randomChk.checked;
    for (const control of setupControls) control.disabled = running;
    randomChk.disabled = running;
    barsSelect.disabled = running || !autoChk.checked;
    readout.textContent = formatTime(running ? performance.now() - keyStartedAt : 0);
    renderNext();
    renderWheel();
    renderStats();
    renderRuns();
  };

  // ---- Run ----
  const tick = () => {
    readout.textContent = formatTime(performance.now() - keyStartedAt);
    renderStats();
    rafId = running ? requestAnimationFrame(tick) : null;
  };
  const cancelTick = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  /** Move on round the circle, banking the time spent on the key just played. */
  const advance = () => {
    if (!running) return;
    times.push(performance.now() - keyStartedAt);
    keysDone += 1;
    index = (index + 1) % keys.length;
    keyStartedAt = performance.now();
    keyStartBar = currentBar;
    const key = currentKey();
    if (droneChk.checked && key) void drone.start(key.pc);
    drawNeck();
    render();
  };

  const startRun = async () => {
    if (running) return;
    if (randomChk.checked) startSelect.value = String(Math.floor(Math.random() * 12));
    keys = circleKeys(startPc(), direction());
    index = 0;
    keysDone = 0;
    times = [];
    stopwatch.reset();
    stopwatch.start();
    running = true;
    keyStartedAt = performance.now();
    currentBar = 0;
    keyStartBar = 0;
    const key = currentKey();
    if (droneChk.checked && key) {
      drone.setFifth(fifthChk.checked);
      drone.setVolume(Number(droneVol.value));
      void drone.start(key.pc);
    }
    drawNeck();
    render();
    tick();
    if (barsPerKey() !== null) {
      // Restart the click so the first key gets its full count of bars.
      stopTransport();
      await startTransport();
    }
  };

  const endRun = () => {
    running = false;
    stopwatch.stop();
    cancelTick();
    drone.stop();
  };

  const stopRun = () => {
    if (!running) return;
    const bars = barsPerKey();
    const played = keysDone;
    const ms = times.reduce((a, b) => a + b, 0);
    endRun();
    if (bars !== null) stopTransport();
    // The key you were on when you stopped was never finished, so it is not counted.
    if (played > 0) {
      const run: Run = {
        date: new Date().toISOString(),
        ms,
        keys: played,
        laps: Math.max(1, Math.ceil(played / KEYS_PER_LAP)),
        startKey: keys[0]?.name ?? '',
        direction: direction() === 'fifths' ? 'Fifths' : 'Fourths',
        scale: scale().name,
        from: fromFret(),
        to: toFret(),
        bars,
      };
      runs = [run, ...runs].slice(0, VIEW_LIMIT);
      appendToLog(LOG_KEYS.circle, run, LOG_LIMIT);
    }
    drawNeck();
    render();
  };

  /** Abandon a run without recording it (leaving the tab). */
  const abandonRun = () => {
    if (!running) return;
    const bars = barsPerKey();
    endRun();
    if (bars !== null) stopTransport();
    times = [];
    keysDone = 0;
  };

  // ---- Wiring ----
  startBtn.addEventListener('click', () => (running ? stopRun() : void startRun()));
  nextBtn.addEventListener('click', advance);

  directionSelect.addEventListener('change', () => {
    fillStartKeys();
    render();
  });
  startSelect.addEventListener('change', () => {
    if (!running) drawNeck();
    render();
  });
  scaleSelect.addEventListener('change', () => {
    drawNeck();
    render();
  });
  fromSelect.addEventListener('change', () => {
    drawNeck();
    render();
  });
  widthSelect.addEventListener('change', () => {
    fillFrom(fromFret());
    drawNeck();
    render();
  });
  randomChk.addEventListener('change', render);
  showChk.addEventListener('change', () => {
    drawNeck();
    render();
  });
  autoChk.addEventListener('change', render);
  barsSelect.addEventListener('change', renderNext);
  droneChk.addEventListener('change', () => {
    const key = currentKey();
    if (!droneChk.checked) drone.stop();
    else if (running && key) void drone.start(key.pc);
  });
  fifthChk.addEventListener('change', () => drone.setFifth(fifthChk.checked));
  droneVol.addEventListener('input', () => drone.setVolume(Number(droneVol.value)));

  // The click drives the cycle: a new key every N bars, with the last bar flagged.
  metronome.onBeat((info) => {
    if (!running) return;
    currentBar = info.bar;
    const bars = barsPerKey();
    if (bars === null || !info.isAccent) return;
    if (info.bar - keyStartBar >= bars) advance();
    else renderNext();
  });

  // ---- Assemble ----
  const element = el('div', { class: 'routine-body' }, [
    el('div', { class: 'grid-hint' }, [
      'Pick a fret window and walk the circle of fifths inside it: play the key on the wheel, then move ' +
        'round to the next one without moving your hand. Start wherever you like, or tick Random start ' +
        'to be dropped somewhere on the circle. The click can turn the wheel for you, or press Next key ' +
        'when you are ready.',
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled('Start on', startSelect),
      labeled('Direction', directionSelect),
      labeled('Scale', scaleSelect),
      labeled('From fret', fromSelect),
      labeled('Window', widthSelect),
      inlineChk(randomChk, 'Random start'),
    ]),
    el('div', { class: 'circle-main' }, [
      wheel.element,
      el('div', { class: 'practice-now circle-now' }, [keyEl, detailEl, nextEl]),
      el('div', { class: 'practice-timer' }, [readout, startBtn]),
    ]),
    el('div', { class: 'practice-actions' }, [
      nextBtn,
      inlineChk(autoChk, 'Turn the wheel with the click'),
      labeled('Pace', barsSelect),
      inlineChk(showChk, 'Show the scale on the neck'),
    ]),
    statsEl,
    el('div', { class: 'backing-row' }, [
      inlineChk(droneChk, 'Drone on the key (follows the circle)'),
      inlineChk(fifthChk, 'Add 5th'),
      labeled('Drone volume', droneVol),
    ]),
    runsEl,
  ]);

  fillStartKeys();
  fillFrom(DEFAULT_FROM);
  render();

  return {
    id: 'circle',
    name: 'Circle of fifths · key by key',
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
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
