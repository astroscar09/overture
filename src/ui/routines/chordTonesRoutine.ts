import { playChord, playNote } from '../../audio/engine';
import { DEFAULT_FRETS } from '../../fretboard/Fretboard';
import { CHORD_QUALITIES, type IntervalRole } from '../../music/chordTones';
import {
  CHORD_TARGETS,
  DEFAULT_QUALITIES,
  DRILL_QUALITIES,
  chordPromptKey,
  chordPrompts,
  drillChordName,
  drillNoteName,
  resolveChordPrompt,
  type ChordPrompt,
  type ChordTarget,
} from '../../music/noteDrill';
import { noteName, pitchClass, type PitchClass } from '../../music/notes';
import { LOG_KEYS, appendToLog } from '../../practice/history';
import { RecencyPicker } from '../../practice/picker';
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
/** Octave the chord and its tones are sounded in (C3 = MIDI 48). */
const HEAR_BASE_MIDI = 48;
/** Gap between the root and the answer in the two-note preview (ms). */
const HEAR_GAP_MS = 420;
/** The fretboard's colour class for each interval role. */
const ROLE_SWATCH: Record<IntervalRole, string> = { R: 'tone-root', '3': 'tone-3', '5': 'tone-5', '7': 'tone-7' };

interface Run {
  date: string; // ISO timestamp
  ms: number; // whole run
  count: number; // chords answered
  avgMs: number;
  chords: string;
  target: string;
  auto: number | null; // bars per prompt, null when self-paced
}

const perChord = (ms: number, count: number) => (count > 0 ? ms / count : 0);

/**
 * Routine: a chord is called out — C, F#m, Bb7, Dm7, Gmaj7 — and you find its
 * 3rd, 5th or 7th on the neck. The same shape as the note finder: the neck is
 * blank until you reveal, any chord but the one on screen can come up next,
 * and it runs for as long as you keep pressing Next.
 */
export function createChordTonesRoutine(deps: PracticeDeps): Routine {
  const { fretboard, metronome, drone, startTransport, stopTransport } = deps;

  const stopwatch = new Stopwatch();
  const picker = new RecencyPicker<ChordPrompt>([], chordPromptKey);
  // Only this visit to the Practice tab: cleared by clearHistory() on leaving.
  let runs: Run[] = [];
  let active = false;
  let running = false;
  let revealed = false;
  let current: ChordPrompt | null = null;
  /** performance.now() when the current chord appeared. */
  let askedAt = 0;
  /** Milliseconds spent on each chord answered so far this run. */
  let times: number[] = [];
  let rafId: number | null = null;
  /** Bar the last auto-advance happened on, so a slower setting still lines up. */
  let lastAutoBar = 0;

  // ---- Setup ----
  const qualityChecks = DRILL_QUALITIES.map(({ id, name }) => {
    const chk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
    chk.checked = DEFAULT_QUALITIES.includes(id);
    return { id, name, chk };
  });
  const targetSelect = selectEl();
  targetSelect.append(
    ...CHORD_TARGETS.map((t) => option(t.id, t.name)),
    option(MIXED, 'Mixed (3rds, 5ths & 7ths)'),
  );
  const autoChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  const autoBarsSelect = selectEl();
  autoBarsSelect.append(...AUTO_BARS.map((b) => option(String(b), b === 1 ? 'every bar' : `every ${b} bars`)));
  autoBarsSelect.value = String(DEFAULT_AUTO_BARS);

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

  // ---- Prompt ----
  const promptEl = el('div', { class: 'drill-note' }, ['–']);
  const askEl = el('div', { class: 'now-detail' });
  const answerEl = el('div', { class: 'drill-answer' });
  const readout = el('div', { class: 'stopwatch' }, [formatTime(0)]);
  const startBtn = el('button', { class: 'btn primary', type: 'button' }, ['Start']);
  const nextBtn = el('button', { class: 'btn', type: 'button' }, ['Next chord']);
  const revealBtn = el('button', { class: 'btn', type: 'button' }, ['Reveal']);
  const hearBtn = el('button', { class: 'btn', type: 'button' }, ['Hear the chord']);
  const statsEl = el('div', { class: 'drill-stats' });
  const legendEl = el('div', { class: 'chord-legend hidden' });
  const runsEl = el('div', { class: 'practice-history hidden' });

  // Setup is locked while a run is going so the score means one thing.
  const setupControls = [targetSelect, autoChk, autoBarsSelect, ...qualityChecks.map((q) => q.chk)];

  const qualities = () => qualityChecks.filter((q) => q.chk.checked).map((q) => q.id);
  const targets = (): ChordTarget[] =>
    targetSelect.value === MIXED
      ? CHORD_TARGETS
      : [CHORD_TARGETS.find((t) => t.id === targetSelect.value) ?? CHORD_TARGETS[0]];
  const targetLabel = () => (targetSelect.value === MIXED ? '3rds, 5ths & 7ths' : targets()[0].name);
  const chordsLabel = () => {
    const names = qualityChecks.filter((q) => q.chk.checked).map((q) => q.name);
    return names.length ? names.join(', ') : 'none';
  };
  const autoBars = () => (autoChk.checked ? Number(autoBarsSelect.value) : null);

  // The picker's memory of what it just called survives this, so changing the
  // settings (or stopping and starting) never repeats the chord on screen.
  const refillPool = () => picker.setItems(chordPrompts(qualities(), targets()));

  /** Why there is nothing to ask, if there is nothing to ask. */
  const poolProblem = (): string | null => {
    if (picker.size > 0) return null;
    if (qualities().length === 0) return 'Tick at least one chord type to drill.';
    // 3rds and 5ths exist in every chord here, so only a 7th can come up empty.
    return 'None of the ticked chords has a 7th — add 7, m7, maj7 or m7b5, or pick another target.';
  };

  // ---- Neck ----
  /** Root + answer, colour-coded by the role each one plays in the chord. */
  const revealRoles = (prompt: ChordPrompt): Map<PitchClass, IntervalRole> => {
    const { targetPc } = resolveChordPrompt(prompt);
    return new Map<PitchClass, IntervalRole>([
      [pitchClass(prompt.rootPc), 'R'],
      [targetPc, prompt.target.role],
    ]);
  };

  const drawNeck = () => {
    if (!active) return;
    if (!running || current === null) {
      // Idle: the whole neck is on show as a reference.
      fretboard.setChordTones(null);
      fretboard.setPattern(null);
      fretboard.setMode('all');
      return;
    }
    fretboard.setMode('chord');
    // An empty role map hides every node, so the neck is blank until you reveal.
    fretboard.setChordTones(revealed ? revealRoles(current) : new Map());
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
      ['Answered', 'Per chord', 'Total', 'Chords', 'Target', 'Pace', 'When'].map((h) => el('th', {}, [h])),
    );
    const rows = runs.slice(0, SHOWN_RUNS).map((r) => {
      const row = el('tr', {}, [
        el('td', {}, [String(r.count)]),
        el('td', {}, [formatTime(r.avgMs)]),
        el('td', {}, [formatTime(r.ms)]),
        el('td', {}, [r.chords]),
        el('td', {}, [r.target]),
        el('td', {}, [r.auto === null ? 'Self-paced' : `${r.auto} bar${r.auto === 1 ? '' : 's'}`]),
        el('td', {}, [new Date(r.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]),
      ]);
      if (r === best) row.classList.add('best');
      return row;
    });
    runsEl.replaceChildren(
      ...(best
        ? [el('div', { class: 'summary-head' }, [`Fastest: ${formatTime(best.avgMs)} per chord over ${best.count}`])]
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
      statsEl.textContent =
        poolProblem() ?? `${chordsLabel()} · ${targetLabel()} · ${picker.size} chords in rotation`;
      return;
    }
    // Averaged over the chords actually answered, so the one on screen does not
    // drag the number up while you are still working it out.
    const banked = times.reduce((a, b) => a + b, 0);
    statsEl.textContent =
      `${done} answered · ${formatTime(perChord(banked, done))} per chord` +
      (done ? ` · fastest ${formatTime(Math.min(...times))}` : '') +
      ` · ${formatTime(stopwatch.elapsed())} total`;
  };

  const render = () => {
    const answer = current === null ? null : resolveChordPrompt(current);
    promptEl.textContent =
      current === null ? '–' : `${drillChordName(current.rootPc, current.qualityId)} → ${current.target.label}`;
    if (!running || current === null) {
      askEl.textContent =
        current === null
          ? 'Press Start: a chord is called and you find its 3rd, 5th or 7th on the neck.'
          : 'Run over. Press Start to go again.';
    } else {
      const quality = CHORD_QUALITIES[current.qualityId];
      askEl.textContent =
        `${drillNoteName(current.rootPc)} ${quality.label.toLowerCase()} · ` +
        `find the ${current.target.label} of the chord.`;
    }
    if (revealed && current !== null && answer !== null) {
      answerEl.textContent =
        `${drillNoteName(answer.targetPc)} — the ${answer.toneName} of ` +
        `${drillChordName(current.rootPc, current.qualityId)}`;
    } else {
      answerEl.textContent = '';
    }
    legendEl.classList.toggle('hidden', !revealed || current === null);
    if (revealed && current !== null) {
      // Only the two colours actually lit on the neck.
      legendEl.replaceChildren(
        el('span', { class: 'swatch tone-root' }, ['Chord root']),
        el('span', { class: `swatch ${ROLE_SWATCH[current.target.role]}` }, [`the ${current.target.label}`]),
      );
    }
    startBtn.textContent = running ? 'Stop' : 'Start';
    startBtn.classList.toggle('is-running', running);
    startBtn.disabled = !running && picker.size === 0;
    nextBtn.disabled = !running;
    revealBtn.disabled = !running || revealed;
    hearBtn.disabled = current === null;
    hearBtn.textContent = revealed ? 'Hear the answer' : 'Hear the chord';
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

  /** Call the next chord, banking the time spent on the one before it. */
  const ask = (bank: boolean) => {
    if (bank && current !== null) times.push(performance.now() - askedAt);
    const next = picker.next();
    if (next === null) return;
    current = next;
    revealed = false;
    askedAt = performance.now();
    if (droneChk.checked && running) void drone.start(pitchClass(current.rootPc));
    drawNeck();
    render();
  };

  const startRun = async () => {
    if (running) return;
    refillPool();
    if (picker.size === 0) return;
    times = [];
    stopwatch.reset();
    stopwatch.start();
    running = true;
    current = null;
    lastAutoBar = 0;
    if (droneChk.checked) {
      drone.setFifth(fifthChk.checked);
      drone.setVolume(Number(droneVol.value));
    }
    ask(false);
    tick();
    if (autoBars() !== null) {
      // Restart the click so the first chord gets a whole bar.
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
    // The chord on screen when you stopped was never answered, so it is not scored.
    if (times.length > 0) {
      const ms = times.reduce((a, b) => a + b, 0);
      const run: Run = {
        date: new Date().toISOString(),
        ms,
        count: times.length,
        avgMs: perChord(ms, times.length),
        chords: chordsLabel(),
        target: targetLabel(),
        auto,
      };
      runs = [run, ...runs].slice(0, VIEW_LIMIT);
      appendToLog(LOG_KEYS.chordTones, run, LOG_LIMIT);
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
    if (current === null) return;
    const root = HEAR_BASE_MIDI + pitchClass(current.rootPc);
    if (!revealed) {
      // The whole chord as a reference: you still have to pick the tone out of it.
      const tones = CHORD_QUALITIES[current.qualityId].tones;
      void playChord(tones.map((t) => noteName(root + t.semitone)));
      return;
    }
    const { semitone } = resolveChordPrompt(current);
    void playNote(noteName(root), '4n');
    window.setTimeout(() => void playNote(noteName(root + semitone), '4n'), HEAR_GAP_MS);
  });

  const onSetupChange = () => {
    refillPool();
    render();
  };
  targetSelect.addEventListener('change', onSetupChange);
  for (const { chk } of qualityChecks) chk.addEventListener('change', onSetupChange);
  autoChk.addEventListener('change', render);
  droneChk.addEventListener('change', () => {
    if (!droneChk.checked) drone.stop();
    else if (running && current !== null) void drone.start(pitchClass(current.rootPc));
  });
  fifthChk.addEventListener('change', () => drone.setFifth(fifthChk.checked));
  droneVol.addEventListener('input', () => drone.setVolume(Number(droneVol.value)));

  // Auto-advance rides the shared click: a new chord every N bars.
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
      'A chord is called out — C, F#m, A#7, Dm7 — and the neck goes blank: find its 3rd, 5th or 7th, ' +
        'then reveal to check yourself. Tick the chord types you want in the mix. Like the note finder ' +
        'it runs as long as you like, never calls the same chord twice in a row, and leans towards the ' +
        'ones you have not had lately.',
    ]),
    el('div', { class: 'trainer-head' }, [
      labeled(
        'Chord types',
        el(
          'div',
          { class: 'quality-checks' },
          qualityChecks.map(({ name, chk }) => inlineChk(chk, name)),
        ),
      ),
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
      inlineChk(droneChk, 'Drone on the chord root'),
      inlineChk(fifthChk, 'Add 5th'),
      labeled('Drone volume', droneVol),
    ]),
    runsEl,
  ]);

  refillPool();
  render();

  return {
    id: 'chordTones',
    name: 'Chord tones · 3rds, 5ths & 7ths',
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      refillPool();
      drawNeck();
      render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      abandonRun();
      fretboard.setChordTones(null);
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
