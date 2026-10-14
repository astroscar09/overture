import { PhrasePlayer } from '../../audio/phrasePlayer';
import type { Metronome } from '../../audio/metronome';
import { DEFAULT_FRETS, type Fretboard } from '../../fretboard/Fretboard';
import { GenerationError, generateExercise } from '../../generate/pipeline';
import { randomSeed } from '../../generate/rng';
import { DEFAULT_STYLE, STYLE_IDS } from '../../generate/styleProfiles';
import { TECHNIQUES, techniqueName, type Difficulty, type ExerciseSpec, type Phrase, type TechniqueId } from '../../generate/types';
import { SCALES } from '../../music/scales';
import { MAJOR_KEYS_BY_FIFTHS } from '../../music/theory/keys';
import { renderTab, type TabView } from '../../notation/tab';
import type { ProgressLog } from '../../practice/progress';
import { cleanTempo } from '../../practice/progress';
import type { AppState } from '../../state';
import { el, inlineChk, labeled, option, selectEl } from '../dom';

export interface TechniquePanel {
  element: HTMLElement;
  /** Switch to a technique by id. Used by the review queue. */
  selectTechnique(id: string): boolean;
  activate(): void;
  deactivate(): void;
  refresh(): void;
}

export interface TechniqueDeps {
  fretboard: Fretboard;
  metronome: Metronome;
  state: AppState;
  progress: ProgressLog;
  startTransport: () => Promise<void>;
  stopTransport: () => void;
}

const WINDOW_WIDTHS = [4, 5, 6];
const BAR_CHOICES = [1, 2, 4];
/** "blues-rock" -> "Blues rock". */
const styleName = (id: string): string => id === DEFAULT_STYLE ? 'All styles' : id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ');
/** Loops to hold a tempo before the ramp moves it on. */
const RAMP_EVERY = 2;
const RAMP_STEP = 4;

/**
 * The technique generator: pick what to work on, get a playable exercise with
 * tab, loop it, and let the tempo climb while you hold it together.
 */
export function createTechniquePanel(deps: TechniqueDeps): TechniquePanel {
  const { fretboard, metronome, state, progress, startTransport, stopTransport } = deps;

  let active = false;
  let phrase: Phrase | null = null;
  let tab: TabView | null = null;
  let error: GenerationError | null = null;
  let playing = false;
  let rampFrom = 0;

  const player = new PhrasePlayer({
    metronome,
    onNote: (index) => {
      tab?.highlight(index);
      if (index !== null && phrase) highlightOnNeck(phrase.events[index]);
    },
    onLoop: (count) => {
      loopsEl.textContent = `${count} time${count === 1 ? '' : 's'} round`;
      if (rampChk.checked && count > 0 && count % RAMP_EVERY === 0) {
        const next = Math.min(300, state.bpm + RAMP_STEP);
        if (next !== state.bpm) {
          state.bpm = next;
          metronome.setBpm(next);
          bpmEl.textContent = `${next} BPM`;
        }
      }
    },
  });

  // ---- Controls ----
  const techniqueSelect = selectEl();
  techniqueSelect.append(...TECHNIQUES.map((t) => option(t.id, t.name)));
  const keySelect = selectEl();
  keySelect.append(...MAJOR_KEYS_BY_FIFTHS.map((k) => option(k, k)));
  keySelect.value = 'E';
  const scaleSelect = selectEl();
  scaleSelect.append(
    option('minor pentatonic', 'Minor pentatonic'),
    option('blues', 'Blues'),
    option('aeolian', 'Natural minor'),
    option('dorian', 'Dorian'),
    option('phrygian', 'Phrygian'),
    option('mixolydian', 'Mixolydian'),
    option('major', 'Major'),
    option('harmonic minor', 'Harmonic minor'),
  );
  scaleSelect.value = 'minor pentatonic';
  const styleSelect = selectEl();
  styleSelect.append(option(DEFAULT_STYLE, styleName(DEFAULT_STYLE)), ...STYLE_IDS.map((id) => option(id, styleName(id))));
  styleSelect.value = DEFAULT_STYLE;
  const fromSelect = selectEl();
  fromSelect.append(...Array.from({ length: 11 }, (_, f) => option(String(f), f === 0 ? 'Open' : String(f))));
  fromSelect.value = '5';
  const widthSelect = selectEl();
  widthSelect.append(...WINDOW_WIDTHS.map((w) => option(String(w), `${w} frets`)));
  widthSelect.value = '5';
  const difficultySelect = selectEl();
  difficultySelect.append(...[1, 2, 3, 4, 5].map((d) => option(String(d), `Difficulty ${d}`)));
  difficultySelect.value = '3';
  const barsSelect = selectEl();
  barsSelect.append(...BAR_CHOICES.map((b) => option(String(b), `${b} bar${b === 1 ? '' : 's'}`)));
  barsSelect.value = '2';
  const rampChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;

  const newBtn = el('button', { class: 'btn', type: 'button' }, ['New exercise']);
  const playBtn = el('button', { class: 'btn primary', type: 'button' }, ['Play']);
  const cleanBtn = el('button', { class: 'btn', type: 'button' }, ['Played it clean']);

  const blurbEl = el('div', { class: 'grid-hint' });
  const tabHolder = el('div', { class: 'tab-holder' });
  const titleEl = el('div', { class: 'now-key' });
  const detailEl = el('div', { class: 'now-detail' });
  const bpmEl = el('div', { class: 'stopwatch' });
  const loopsEl = el('div', { class: 'drill-stats' });
  const bestEl = el('div', { class: 'drill-stats' });
  const errorEl = el('div', { class: 'theory-feedback hidden' });

  const setupControls = [techniqueSelect, keySelect, scaleSelect, styleSelect, fromSelect, widthSelect, difficultySelect, barsSelect];

  const technique = () => techniqueSelect.value as TechniqueId;
  const windowOf = (): [number, number] => {
    const from = Number(fromSelect.value);
    return [from, from + Number(widthSelect.value) - 1];
  };

  const specNow = (seed: number): ExerciseSpec => ({
    technique: technique(),
    key: keySelect.value,
    scale: scaleSelect.value,
    window: windowOf(),
    bars: Number(barsSelect.value),
    difficulty: Number(difficultySelect.value) as Difficulty,
    bpm: state.bpm,
    seed,
    style: technique() === 'phrasing' ? styleSelect.value : undefined,
  });

  // ---- Neck ----
  const highlightOnNeck = (event: { string: number; fret: number }): void => {
    if (!active) return;
    fretboard.setMarks([{ string: event.string, fret: event.fret, style: 'primary' }]);
  };

  const drawNeck = () => {
    if (!active) return;
    fretboard.setMode('marks');
    if (!phrase) {
      fretboard.setMarks([]);
      return;
    }
    // At rest the neck shows the shape the exercise lives in.
    const seen = new Map<string, { string: number; fret: number }>();
    for (const e of phrase.events) seen.set(`${e.string}:${e.fret}`, { string: e.string, fret: e.fret });
    fretboard.setMarks([...seen.values()].map((p) => ({ ...p, style: 'ghost' as const })));
  };

  // ---- Render ----
  const render = () => {
    const spec = TECHNIQUES.find((t) => t.id === technique());
    blurbEl.textContent = spec?.blurb ?? '';
    styleField.classList.toggle('hidden', technique() !== 'phrasing');
    errorEl.classList.toggle('hidden', error === null);
    if (error) {
      errorEl.replaceChildren(
        el('div', { class: 'theory-verdict' }, ['No exercise fits those settings']),
        el('div', { class: 'theory-rationale' }, [error.message]),
        el('div', { class: 'theory-diagnosis' }, [
          `Blocked by: ${[...new Set(error.violations.map((v) => v.rule))].join(', ')}. Try a wider fret window or a different scale.`,
        ]),
      );
    }

    if (phrase) {
      const [lo, hi] = phrase.window;
      titleEl.textContent = `${techniqueName(phrase.meta.technique)} · ${phrase.meta.key} ${SCALES[phrase.meta.scale]?.name ?? phrase.meta.scale}`;
      detailEl.textContent =
        `Frets ${lo}–${hi} · ${phrase.bars} bar${phrase.bars === 1 ? '' : 's'} · ${phrase.events.length} notes · ` +
        `${phrase.meta.contour.replace('-', ' ')} · difficulty ${phrase.meta.difficulty}`;
    } else {
      titleEl.textContent = 'No exercise yet';
      detailEl.textContent = 'Choose a technique and press New exercise.';
    }

    bpmEl.textContent = `${state.bpm} BPM`;
    playBtn.textContent = playing ? 'Stop' : 'Play';
    playBtn.classList.toggle('is-running', playing);
    playBtn.disabled = phrase === null;
    cleanBtn.disabled = phrase === null || playing;
    for (const control of setupControls) control.disabled = playing;
    newBtn.disabled = playing;

    const best = phrase ? cleanTempo(progress.all(), `technique:${phrase.meta.technique}`) : null;
    bestEl.textContent = best
      ? `Cleanest so far for ${techniqueName(technique())}: ${best} BPM`
      : `No clean run logged for ${techniqueName(technique())} yet`;
  };

  // ---- Actions ----
  const build = () => {
    stop();
    try {
      const result = generateExercise(specNow(randomSeed()));
      phrase = result.phrase;
      error = null;
      tab = renderTab(phrase);
      tabHolder.replaceChildren(tab.element);
    } catch (e) {
      if (!(e instanceof GenerationError)) throw e;
      error = e;
      phrase = null;
      tab = null;
      tabHolder.replaceChildren();
    }
    loopsEl.textContent = '';
    drawNeck();
    render();
  };

  const play = async () => {
    if (!phrase || playing) return;
    rampFrom = state.bpm;
    player.load(phrase);
    playing = true;
    render();
    stopTransport();
    await startTransport();
    await player.start(state.bpm);
  };

  const stop = () => {
    if (!playing) return;
    player.stop();
    stopTransport();
    playing = false;
    tab?.highlight(null);
    // The tempo may have climbed; leave it where the player left it but say so.
    if (rampChk.checked && state.bpm !== rampFrom) {
      loopsEl.textContent = `Ramped ${rampFrom} → ${state.bpm} BPM`;
    }
    drawNeck();
    render();
  };

  const logClean = () => {
    if (!phrase) return;
    progress.record({
      kind: 'technique',
      ref: `technique:${phrase.meta.technique}`,
      tier: phrase.meta.difficulty,
      bpm: state.bpm,
      clean: true,
      seed: phrase.meta.seed,
    });
    render();
  };

  newBtn.addEventListener('click', build);
  playBtn.addEventListener('click', () => (playing ? stop() : void play()));
  cleanBtn.addEventListener('click', logClean);
  for (const control of setupControls) control.addEventListener('change', () => { if (!playing) build(); });

  // ---- Assemble ----
  const styleField = labeled('Style', styleSelect);
  const element = el('div', { class: 'group technique-group' }, [
    el('div', { class: 'trainer-head' }, [
      labeled('Technique', techniqueSelect),
      labeled('Key', keySelect),
      labeled('Scale', scaleSelect),
      styleField,
      labeled('From fret', fromSelect),
      labeled('Window', widthSelect),
      labeled('Difficulty', difficultySelect),
      labeled('Length', barsSelect),
    ]),
    blurbEl,
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [titleEl, detailEl]),
      el('div', { class: 'practice-timer' }, [bpmEl, playBtn]),
    ]),
    tabHolder,
    el('div', { class: 'practice-actions' }, [
      newBtn,
      cleanBtn,
      inlineChk(rampChk, `Climb ${RAMP_STEP} BPM every ${RAMP_EVERY} loops`),
    ]),
    loopsEl,
    bestEl,
    errorEl,
  ]);

  render();

  return {
    element,
    selectTechnique(id) {
      if (!TECHNIQUES.some((t) => t.id === id)) return false;
      techniqueSelect.value = id;
      if (!playing) build();
      return true;
    },
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      if (!phrase && !error) build();
      else {
        drawNeck();
        render();
      }
    },
    deactivate() {
      if (!active) return;
      stop();
      active = false;
      fretboard.setMarks(null);
    },
    refresh: drawNeck,
  };
}
