import { playNote } from '../../audio/engine';
import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import { improvKeyName, type Tonality } from '../../music/improv';
import {
  DIATONIC_TARGETS,
  diatonicPrompts,
  intervalQuality,
  keyNoteName,
  ordinal,
  pitchClassSpots,
  promptKey,
  resolvePrompt,
  type DiatonicPrompt,
  type DiatonicTarget,
} from '../../music/noteDrill';
import { noteName, pitchClass, type PitchClass } from '../../music/notes';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { ShuffleBag } from '../../practice/shuffleBag';
import { Stopwatch, formatTime } from '../../practice/stopwatch';
import { el, inlineChk, labeled, option, selectEl } from '../dom';
import type { PracticeDeps, Routine } from './types';

/** Picker value that rotates through 3rds, 5ths and 7ths together. */
const MIXED = 'mixed';
/** Bars per prompt when the click drives the drill. */
const AUTO_BARS = [1, 2, 4];
const DEFAULT_AUTO_BARS = 2;
/** Runs kept in the long-term log (localStorage). */
const LOG_LIMIT = 500;
/** Runs held for the current visit to the Practice tab. */
const VIEW_LIMIT = 50;
const SHOWN_RUNS = 10;
/** Octave the reference pitches are played in (C4 = middle C). */
const HEAR_OCTAVE_MIDI = 60;
/** Gap between the two notes of the interval preview (ms). */
const HEAR_GAP_MS = 420;

interface Run {
  date: string; // ISO timestamp
  ms: number; // whole run
  count: number; // prompts answered
  avgMs: number;
  keyPc: number;
  tonality: Tonality;
  target: string;
  auto: number | null; // bars per prompt, null when self-paced
}

const perPrompt = (ms: number, count: number) => (count > 0 ? ms / count : 0);

/**
 * Routine: pick a key, then work through its notes naming the 3rd, 5th or 7th
 * above each one *within that key* — the intervals that build the key's chords.
 * Like the note finder it runs indefinitely, reshuffling its questions rather
 * than stopping after one pass.
 */
export function createKeyTargetsRoutine(deps: PracticeDeps): Routine {
  const { fretboard, metronome, drone, state, startTransport, stopTransport } = deps;

  const stopwatch = new Stopwatch();
  const bag = new ShuffleBag<DiatonicPrompt>([], promptKey);
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let runs: Run[] = [];
  let active = false;
  let running = false;
  let revealed = false;
  let current: DiatonicPrompt | null = null;
  /** performance.now() when the current prompt appeared. */
  let askedAt = 0;
  /** Milliseconds spent on each prompt answered so far this run. */
  let times: number[] = [];
  let rafId: number | null = null;
  /** Bar the last auto-advance happened on, so a slower setting still lines up. */
  let lastAutoBar = 0;

  // ---- Setup ----
  const keySelect = selectEl();
  const tonalitySelect = selectEl();
  tonalitySelect.append(option('major', 'Major'), option('minor', 'Natural minor'));
  const targetSelect = selectEl();
  targetSelect.append(
    ...DIATONIC_TARGETS.map((t) => option(t.id, t.name)),
    option(MIXED, 'Mixed (3rds, 5ths & 7ths)'),
  );
  const autoChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const autoBarsSelect = selectEl();
  autoBarsSelect.append(...AUTO_BARS.map((b) => option(String(b), b === 1 ? 'every bar' : `every ${b} bars`)));
  autoBarsSelect.value = String(DEFAULT_AUTO_BARS);

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

  // ---- Prompt ----
  const promptEl = el('div', { class: 'drill-note' }, ['–']);
  const askEl = el('div', { class: 'now-detail' });
  const answerEl = el('div', { class: 'drill-answer' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const startBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);
  const nextBtn = el('button', { class: 'btn', type: 'button' }, ['Next']);
  const revealBtn = el('button', { class: 'btn', type: 'button' }, ['Reveal']);
  const hearBtn = el('button', { class: 'btn', type: 'button' }, ['Hear it']);
  const statsEl = el('div', { class: 'drill-stats' });
  const legendEl = el('div', { class: 'drill-legend hidden' }, [
    el('span', {}, [el('span', { class: 'dot root' }), 'the answer']),
    el('span', {}, [el('span', { class: 'dot from' }), 'the note you started on']),
  ]);
  const runsEl = el('div', { class: 'practice-history hidden' });

  // Setup is locked while a run is going so the score means one thing.
  const setupControls = [keySelect, tonalitySelect, targetSelect, autoChk, autoBarsSelect];

  const tonality = () => tonalitySelect.value as Tonality;
  const keyPc = () => Number(keySelect.value);
  const autoBars = () => (autoChk.checked ? Number(autoBarsSelect.value) : null);
  const targets = (): DiatonicTarget[] =>
    targetSelect.value === MIXED
      ? DIATONIC_TARGETS
      : [DIATONIC_TARGETS.find((t) => t.id === targetSelect.value) ?? DIATONIC_TARGETS[0]];
  const targetLabel = () => (targetSelect.value === MIXED ? '3rds, 5ths & 7ths' : targets()[0].name);
  const keyLabel = () => `${improvKeyName(keyPc(), tonality())} ${tonality() === 'major' ? 'major' : 'minor'}`;
  const resolved = () => (current === null ? null : resolvePrompt(current, keyPc(), tonality()));
  const spellPc = (pc: PitchClass) => keyNoteName(pc, keyPc(), tonality());

  const fillKeys = () => {
    const value = keySelect.value || '0';
    keySelect.replaceChildren(
      ...Array.from({ length: 12 }, (_, pc) => option(String(pc), improvKeyName(pc, tonality()))),
    );
    keySelect.value = value;
  };

  const refillBag = () => {
    bag.setItems(diatonicPrompts(targets()));
    bag.reset();
  };

  // ---- Neck ----
  const drawNeck = () => {
    if (!active) return;
    const r = resolved();
    if (!running || r === null) {
      // Idle: the whole neck is on show as a reference.
      fretboard.setPattern(null);
      fretboard.setMode('all');
      return;
    }
    fretboard.setMode('pattern');
    if (!revealed) {
      // Blank until revealed — an empty pattern hides every node.
      fretboard.setPattern({ notes: [], rootPc: r.targetPc });
      return;
    }
    const openMidi = state.tuning.openMidi;
    fretboard.setPattern({
      notes: [
        ...pitchClassSpots(r.targetPc, openMidi, DEFAULT_FRETS),
        ...pitchClassSpots(r.fromPc, openMidi, DEFAULT_FRETS),
      ],
      rootPc: r.targetPc, // the answer takes the root colour, the start note the scale colour
    });
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
      ['Answered', 'Per note', 'Total', 'Key', 'Target', 'Pace', 'When'].map((h) => el('th', {}, [h])),
    );
    const rows = runs.slice(0, SHOWN_RUNS).map((r) => {
      const row = el('tr', {}, [
        el('td', {}, [String(r.count)]),
        el('td', {}, [formatTime(r.avgMs)]),
        el('td', {}, [formatTime(r.ms)]),
        el('td', {}, [`${improvKeyName(r.keyPc, r.tonality)} ${r.tonality}`]),
        el('td', {}, [r.target]),
        el('td', {}, [r.auto === null ? 'Self-paced' : `${r.auto} bar${r.auto === 1 ? '' : 's'}`]),
        el('td', {}, [new Date(r.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]),
      ]);
      if (r === best) row.classList.add('best');
      return row;
    });
    runsEl.replaceChildren(
      ...(best
        ? [
            el('div', { class: 'summary-head' }, [
              `Fastest: ${formatTime(best.avgMs)} per note over ${best.count} in ${improvKeyName(best.keyPc, best.tonality)} ${best.tonality}`,
            ]),
          ]
        : []),
      el('span', { class: 'field-label' }, ['Recent runs']),
      el('div', { class: 'table-scroll' }, [
        el('table', { class: 'summary-table' }, [el('thead', {}, [header]), el('tbody', {}, rows)]),
      ]),
    );
  };

  const renderStats = () => {
    const done = times.length;
    if (!running && done === 0) {
      statsEl.textContent = `${keyLabel()} · ${targetLabel()} · ${bag.size} questions in rotation`;
      return;
    }
    // Averaged over the questions actually answered, so the one on screen does
    // not drag the number up while you are still working it out.
    const banked = times.reduce((a, b) => a + b, 0);
    statsEl.textContent =
      `${done} answered · ${formatTime(perPrompt(banked, done))} per note` +
      (done ? ` · fastest ${formatTime(Math.min(...times))}` : '') +
      ` · ${formatTime(stopwatch.elapsed())} total`;
  };

  const render = () => {
    const r = resolved();
    promptEl.textContent =
      current === null || r === null ? '–' : `${spellPc(r.fromPc)} → ${current.target.label}`;
    if (!running || current === null || r === null) {
      askEl.textContent =
        current === null
          ? 'Press Start: a note from the key is called and you play its 3rd, 5th or 7th within that key.'
          : 'Run over. Press Start to go again.';
    } else {
      askEl.textContent =
        `${keyLabel()} · ${spellPc(r.fromPc)} is the ${ordinal(current.degree + 1)} degree · ` +
        `play the ${current.target.label} above it, staying in the key.`;
    }
    if (revealed && current !== null && r !== null) {
      answerEl.textContent =
        `${spellPc(r.targetPc)} — the ${ordinal(r.targetDegree + 1)} degree, ` +
        `a ${intervalQuality(current.target, r.fromPc, r.targetPc)} up`;
    } else {
      answerEl.textContent = '';
    }
    legendEl.classList.toggle('hidden', !revealed);
    startBtn.textContent = running ? 'Stop' : 'Start';
    startBtn.classList.toggle('is-running', running);
    nextBtn.disabled = !running;
    revealBtn.disabled = !running || revealed;
    hearBtn.disabled = current === null;
    hearBtn.textContent = revealed ? 'Hear the interval' : 'Hear the note';
    for (const control of setupControls) control.disabled = running;
    autoBarsSelect.disabled = running || !autoChk.checked;
    readout.textContent = formatTime(running ? performance.now() - askedAt : 0);
    renderStats();
    renderRuns();
  };

  // ---- Run ----
  const tick = () => {
    readout.textContent = formatTime(performance.now() - askedAt);
    renderStats();
    rafId = running ? requestAnimationFrame(tick) : null;
  };
  const cancelTick = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  /** Ask the next question, banking the time spent on the one before it. */
  const ask = (bank: boolean) => {
    if (bank && current !== null) times.push(performance.now() - askedAt);
    const next = bag.next();
    if (next === null) return;
    current = next;
    revealed = false;
    askedAt = performance.now();
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
    current = null;
    lastAutoBar = 0;
    ask(false);
    tick();
    if (droneChk.checked) {
      drone.setFifth(fifthChk.checked);
      drone.setVolume(Number(droneVol.value));
      void drone.start(keyPc());
    }
    if (autoBars() !== null) {
      // Restart the click so the first question gets a whole bar.
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
    const auto = autoBars();
    endRun();
    if (auto !== null) stopTransport();
    // The question on screen when you stopped was never answered, so it is not scored.
    if (times.length > 0) {
      const ms = times.reduce((a, b) => a + b, 0);
      const run: Run = {
        date: new Date().toISOString(),
        ms,
        count: times.length,
        avgMs: perPrompt(ms, times.length),
        keyPc: keyPc(),
        tonality: tonality(),
        target: targetLabel(),
        auto,
      };
      runs = [run, ...runs].slice(0, VIEW_LIMIT);
      appendToLog(LOG_KEYS.keyTargets, run, LOG_LIMIT);
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
    current = null;
  };

  const reveal = () => {
    if (!running || current === null) return;
    revealed = true;
    drawNeck();
    render();
  };

  // ---- Wiring ----
  startBtn.addEventListener('click', () => (running ? stopRun() : void startRun()));
  nextBtn.addEventListener('click', () => ask(true));
  revealBtn.addEventListener('click', reveal);
  hearBtn.addEventListener('click', () => {
    const r = resolved();
    if (r === null) return;
    const from = HEAR_OCTAVE_MIDI + pitchClass(r.fromPc);
    void playNote(noteName(from), '4n');
    // Before the reveal only the starting note sounds, so the answer stays hidden.
    if (!revealed) return;
    const up = from + pitchClass(r.targetPc - r.fromPc);
    window.setTimeout(() => void playNote(noteName(up), '4n'), HEAR_GAP_MS);
  });

  const onSetupChange = () => {
    refillBag();
    drawNeck();
    render();
  };
  keySelect.addEventListener('change', onSetupChange);
  tonalitySelect.addEventListener('change', () => {
    fillKeys();
    onSetupChange();
  });
  targetSelect.addEventListener('change', onSetupChange);
  autoChk.addEventListener('change', render);
  droneChk.addEventListener('change', () => {
    if (!droneChk.checked) drone.stop();
    else if (running) void drone.start(keyPc());
  });
  fifthChk.addEventListener('change', () => drone.setFifth(fifthChk.checked));
  droneVol.addEventListener('input', () => drone.setVolume(Number(droneVol.value)));

  // Auto-advance rides the shared click: a new question every N bars.
  metronome.onBeat((info) => {
    const bars = autoBars();
    if (!running || bars === null || !info.isAccent) return;
    if (info.bar - lastAutoBar < bars) return;
    lastAutoBar = info.bar;
    ask(true);
  });

  // ---- Assemble ----
  const element = el('div', { class: 'routine-body' }, [
    el('div', { class: 'grid-hint' }, [
      'Pick a key and a target. A note from the key is called and you play (or name) the 3rd, 5th or 7th ' +
        'above it using only notes from that key — the intervals its chords are built from. ' +
        'The neck stays blank until you reveal, and the questions reshuffle so the drill never runs out.',
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled('Key', keySelect),
      labeled('Scale', tonalitySelect),
      labeled('Target', targetSelect),
      inlineChk(autoChk, 'Advance with the click'),
      labeled('Pace', autoBarsSelect),
    ]),
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [promptEl, askEl, answerEl]),
      el('div', { class: 'practice-timer' }, [readout, startBtn]),
    ]),
    el('div', { class: 'practice-actions' }, [nextBtn, revealBtn, hearBtn]),
    legendEl,
    statsEl,
    el('div', { class: 'backing-row' }, [
      inlineChk(droneChk, 'Drone on the key (plays while running)'),
      inlineChk(fifthChk, 'Add 5th'),
      labeled('Drone volume', droneVol),
    ]),
    runsEl,
  ]);

  fillKeys();
  refillBag();
  render();

  return {
    id: 'keyTargets',
    name: 'Key targets · 3rds, 5ths & 7ths',
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
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
