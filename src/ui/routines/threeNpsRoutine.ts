import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import { pitchClass, type PitchClass } from '../../music/notes';
import {
  KEY_NAMES,
  maxPracticeFret,
  noteNameInKey,
  practicePositions,
  type PracticePosition,
} from '../../music/threeNps';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { KEY_COUNT, KeySession } from '../../practice/keySession';
import { Stopwatch, formatTime } from '../../practice/stopwatch';
import { el, inlineChk, labeled } from '../dom';
import type { PracticeDeps, Routine } from './types';

interface KeyResult {
  keyPc: PitchClass;
  ms: number;
  bpm: number;
}

interface SessionRecord {
  id: number;
  date: string; // ISO timestamp of completion
  totalMs: number;
  results: KeyResult[];
}

/** Sessions kept in the long-term log (localStorage). */
const LOG_LIMIT = 200;
/** Sessions shown on screen for the current visit to the Practice tab. */
const VIEW_LIMIT = 10;

function bpmSummary(bpms: number[]): string {
  const min = Math.min(...bpms);
  const max = Math.max(...bpms);
  return min === max ? `${min} BPM` : `${min}–${max} BPM`;
}

/**
 * Routine: 3-notes-per-string scale positions through all 12 keys in a
 * shuffled order, timed per key, with the shared click and a drone.
 */
export function createThreeNpsRoutine(deps: PracticeDeps): Routine {
  const { fretboard, drone, state, startTransport, stopTransport } = deps;

  const session = new KeySession();
  const stopwatch = new Stopwatch();
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let history: SessionRecord[] = [];
  let active = false;
  let positions: PracticePosition[] = [];
  let positionIndex = 0;
  let rafId: number | null = null;

  const hint = el('div', { class: 'grid-hint' }, [
    'Start on the lowest fretted scale note on the A string and play a 3-notes-per-string position up to the high E. ' +
      'Then start from the next scale note, and keep going until the octave. Stop the timer when you finish, then reveal the next key.',
  ]);

  // ---- Key slots ----
  const slotsEl = el('div', { class: 'key-slots' });
  const nextKeyBtn = el('button', { class: 'btn', type: 'button' }, ['Next key']);
  const newSessionBtn = el('button', { class: 'btn', type: 'button' }, ['New session']);

  // ---- Current key + stopwatch ----
  const nowKeyEl = el('div', { class: 'now-key' });
  const nowDetailEl = el('div', { class: 'now-detail' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const timerBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);

  // ---- Positions ----
  const prevPosBtn = el('button', { class: 'btn step', type: 'button', 'aria-label': 'Previous position' }, ['‹']);
  const nextPosBtn = el('button', { class: 'btn step', type: 'button', 'aria-label': 'Next position' }, ['›']);
  const chipsEl = el('div', { class: 'position-chips' });

  // ---- Drone ----
  const droneChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  droneChk.checked = true;
  const fifthChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const droneVol = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    value: '0.5',
    class: 'bpm-slider',
  }) as HTMLInputElement;

  // ---- Results ----
  const summaryEl = el('div', { class: 'practice-summary hidden' });
  const historyEl = el('div', { class: 'practice-history hidden' });

  // ---- Neck ----
  const loadPositions = (keepIndex = false) => {
    const key = session.current;
    positions = key === null ? [] : practicePositions(key, state.tuning);
    positionIndex = keepIndex ? Math.min(positionIndex, Math.max(0, positions.length - 1)) : 0;
  };

  const drawNeck = () => {
    if (!active) return;
    const key = session.current;
    const position = positions[positionIndex];
    fretboard.setMode('pattern');
    fretboard.setPattern(
      key === null || !position ? null : { notes: position.notes, rootPc: key, start: position.notes[0] },
    );
  };

  // ---- Rendering ----
  const renderSlots = () => {
    slotsEl.replaceChildren(
      ...session.order.map((pc, i) => {
        const time = session.times[i];
        const cls = ['key-slot', i === session.index ? 'current' : '', time !== null ? 'done' : '']
          .filter(Boolean)
          .join(' ');
        return el('div', { class: cls }, [
          el('span', { class: 'key-num' }, [String(i + 1)]),
          el('span', { class: 'key-name' }, [i <= session.index ? KEY_NAMES[pc] : '?']),
          el('span', { class: 'key-time' }, [time !== null ? formatTime(time) : '']),
        ]);
      }),
    );
  };

  const renderNow = () => {
    const key = session.current;
    const start = positions[0]?.notes[0];
    if (key === null || !start) {
      nowKeyEl.textContent = 'Ready';
      nowDetailEl.textContent = 'Press “Next key” to reveal your first key.';
      return;
    }
    nowKeyEl.textContent = `${KEY_NAMES[key]} major`;
    nowDetailEl.textContent =
      `Key ${session.index + 1} of ${KEY_COUNT} · start on ${noteNameInKey(pitchClass(start.midi), key)}, ` +
      `A string fret ${start.fret}`;
  };

  const renderPositions = () => {
    const key = session.current ?? 0;
    chipsEl.replaceChildren(
      ...positions.map((p, i) => {
        const chip = el('button', { class: i === positionIndex ? 'chip active' : 'chip', type: 'button' }, [
          noteNameInKey(pitchClass(p.startMidi), key),
        ]);
        chip.title = `Position ${i + 1}`;
        chip.addEventListener('click', () => setPosition(i));
        return chip;
      }),
    );
    prevPosBtn.disabled = positions.length === 0 || positionIndex === 0;
    nextPosBtn.disabled = positions.length === 0 || positionIndex >= positions.length - 1;
  };

  const renderControls = () => {
    nextKeyBtn.disabled = stopwatch.running || !session.canReveal();
    timerBtn.disabled = session.current === null;
    timerBtn.textContent = stopwatch.running ? 'Stop' : 'Start';
    timerBtn.classList.toggle('is-running', stopwatch.running);
    readout.textContent = formatTime(stopwatch.running ? stopwatch.elapsed() : (session.times[session.index] ?? 0));
  };

  const renderSummary = () => {
    summaryEl.classList.toggle('hidden', !session.isComplete);
    if (!session.isComplete) return;
    const header = el('tr', {}, ['#', 'Key', 'Time', 'BPM'].map((h) => el('th', {}, [h])));
    const rows = session.order.map((pc, i) =>
      el('tr', {}, [
        el('td', {}, [String(i + 1)]),
        el('td', {}, [KEY_NAMES[pc]]),
        el('td', {}, [formatTime(session.times[i] ?? 0)]),
        el('td', {}, [String(session.bpms[i] ?? '')]),
      ]),
    );
    summaryEl.replaceChildren(
      el('div', { class: 'summary-head' }, [`All ${KEY_COUNT} keys done · total ${formatTime(session.total())}`]),
      el('div', { class: 'table-scroll' }, [
        el('table', { class: 'summary-table' }, [el('thead', {}, [header]), el('tbody', {}, rows)]),
      ]),
    );
  };

  const renderHistory = () => {
    historyEl.classList.toggle('hidden', history.length === 0);
    historyEl.replaceChildren(
      el('span', { class: 'field-label' }, ['Recent sessions']),
      el(
        'ul',
        { class: 'history-list' },
        history.map((r) =>
          el('li', {}, [
            el('span', { class: 'history-date' }, [
              new Date(r.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
            ]),
            el('span', { class: 'history-total' }, [formatTime(r.totalMs)]),
            el('span', { class: 'history-bpm' }, [bpmSummary(r.results.map((x) => x.bpm))]),
          ]),
        ),
      ),
    );
  };

  const render = () => {
    renderSlots();
    renderNow();
    renderPositions();
    renderControls();
    renderSummary();
    renderHistory();
  };

  // ---- Actions ----
  const setPosition = (i: number) => {
    positionIndex = Math.max(0, Math.min(positions.length - 1, i));
    drawNeck();
    renderPositions();
  };
  prevPosBtn.addEventListener('click', () => setPosition(positionIndex - 1));
  nextPosBtn.addEventListener('click', () => setPosition(positionIndex + 1));

  const tick = () => {
    readout.textContent = formatTime(stopwatch.elapsed());
    rafId = stopwatch.running ? requestAnimationFrame(tick) : null;
  };
  const cancelTick = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  const saveSession = () => {
    const record: SessionRecord = {
      id: session.id,
      date: new Date().toISOString(),
      totalMs: session.total(),
      results: session.order.map((keyPc, i) => ({
        keyPc,
        ms: session.times[i] ?? 0,
        bpm: session.bpms[i] ?? state.bpm,
      })),
    };
    // Re-timing a key after finishing updates this session's entry in place.
    history = [record, ...history.filter((r) => r.id !== record.id)].slice(0, VIEW_LIMIT);
    appendToLog(LOG_KEYS['3nps'], record, LOG_LIMIT, record.id);
  };

  const startTimer = async () => {
    const key = session.current;
    if (key === null || stopwatch.running) return;
    stopwatch.reset();
    stopwatch.start();
    positionIndex = 0;
    drawNeck();
    render();
    tick();
    if (droneChk.checked) {
      drone.setFifth(fifthChk.checked);
      drone.setVolume(Number(droneVol.value));
      void drone.start(key);
    }
    await startTransport();
  };

  // Discard a running attempt without recording it.
  const abandonTimer = () => {
    if (!stopwatch.running) return;
    stopwatch.reset();
    cancelTick();
    drone.stop();
  };

  const stopTimer = () => {
    if (!stopwatch.running) return;
    const ms = stopwatch.stop();
    cancelTick();
    session.record(ms, state.bpm);
    drone.stop();
    stopTransport();
    if (session.isComplete) saveSession();
    render();
  };

  timerBtn.addEventListener('click', () => (stopwatch.running ? stopTimer() : void startTimer()));

  nextKeyBtn.addEventListener('click', () => {
    if (stopwatch.running || !session.reveal()) return;
    stopwatch.reset();
    loadPositions();
    drawNeck();
    render();
  });

  newSessionBtn.addEventListener('click', () => {
    const inProgress = !session.isComplete && session.times.some((t) => t !== null);
    if (inProgress && !window.confirm('Discard this session and reshuffle the keys?')) return;
    if (stopwatch.running) {
      abandonTimer();
      stopTransport();
    }
    session.reset();
    stopwatch.reset();
    loadPositions();
    drawNeck();
    render();
  });

  droneChk.addEventListener('change', () => {
    if (!droneChk.checked) drone.stop();
    else if (stopwatch.running && session.current !== null) void drone.start(session.current);
  });
  fifthChk.addEventListener('change', () => drone.setFifth(fifthChk.checked));
  droneVol.addEventListener('input', () => drone.setVolume(Number(droneVol.value)));

  // ---- Assemble ----
  const element = el('div', { class: 'routine-body' }, [
    hint,
    el('div', { class: 'practice-keys' }, [
      slotsEl,
      el('div', { class: 'practice-actions' }, [nextKeyBtn, newSessionBtn]),
    ]),
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [nowKeyEl, nowDetailEl]),
      el('div', { class: 'practice-timer' }, [readout, timerBtn]),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label' }, ['Position']),
      el('div', { class: 'position-row' }, [prevPosBtn, chipsEl, nextPosBtn]),
    ]),
    el('div', { class: 'backing-row' }, [
      inlineChk(droneChk, 'Drone (plays while timing)'),
      inlineChk(fifthChk, 'Add 5th'),
      labeled('Drone volume', droneVol),
    ]),
    summaryEl,
    historyEl,
  ]);

  render();

  return {
    id: '3nps',
    name: '3NPS positions · all 12 keys',
    element,
    activate() {
      active = true;
      fretboard.setFrets(Math.max(DEFAULT_FRETS, maxPracticeFret(state.tuning) + 1));
      loadPositions(true); // tuning may have changed while away
      drawNeck();
      render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      abandonTimer();
      fretboard.setPattern(null);
      fretboard.setFrets(DEFAULT_FRETS);
      render();
    },
    refresh: drawNeck,
    clearHistory() {
      if (history.length === 0) return;
      history = [];
      renderHistory();
    },
  };
}
