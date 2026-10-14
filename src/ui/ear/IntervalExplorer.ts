import {
  NOTE_LENGTHS,
  PromptPlayer,
  readNoteLength,
  writeNoteLength,
} from '../../audio/promptPlayer';
import {
  INTERVAL_REFERENCE,
  confusableWith,
  referenceFor,
} from '../../exercises/ear/reference';
import type { AudioPrompt } from '../../exercises/types';
import { DEFAULT_FRETS, type Fretboard } from '../../fretboard/Fretboard';
import { int, makeRng, randomSeed } from '../../generate/rng';
import { noteTicks } from '../../music/time';
import { noteName } from '../../music/notes';
import { semitones, spell, type IntervalName } from '../../music/theory/intervals';
import { STANDARD } from '../../music/tuning';
import { el, labeled, option, selectEl } from '../dom';

export interface IntervalExplorer {
  element: HTMLElement;
  activate(): void;
  deactivate(): void;
  refresh(): void;
}

type Direction = 'up' | 'down' | 'together';

/** Roots low enough to leave an octave of headroom on the neck. */
const ROOT_LOW = 45; // A2, the open A string
const ROOT_HIGH = 59; // B3

const PROMPT_BPM = 84; // overridden by the note-length setting at play time

/**
 * A place to listen rather than be tested.
 *
 * The quiz asks whether you can name what you heard. This asks nothing: pick
 * an interval, play it from as many different roots as you like, flip it
 * upside down, and put it next to the one you keep confusing it with. That
 * last part is the one that actually moves the needle — a minor 3rd is only
 * hard until you have heard it back to back with a major 3rd twenty times.
 */
export function createIntervalExplorer(deps: { fretboard: Fretboard }): IntervalExplorer {
  const { fretboard } = deps;

  let active = false;
  let interval: IntervalName = '3M';
  let root = 52; // E3
  let compareTo: IntervalName = confusableWith('3M');
  let noteLength = readNoteLength();
  const prompts = new PromptPlayer();

  // ---- Controls ----
  const grid = el('div', { class: 'interval-grid' });
  const rootSelect = selectEl();
  const directionSelect = selectEl();
  directionSelect.append(
    option('up', 'Ascending'),
    option('down', 'Descending'),
    option('together', 'Together'),
  );
  const lengthSelect = selectEl();
  lengthSelect.append(...NOTE_LENGTHS.map((l) => option(l.id, l.name)));
  lengthSelect.value = noteLength;
  const compareSelect = selectEl();
  compareSelect.append(...INTERVAL_REFERENCE.map((r) => option(r.interval, r.name)));

  const playBtn = el('button', { class: 'btn primary', type: 'button' }, ['Play']);
  const rerollBtn = el('button', { class: 'btn', type: 'button' }, ['New starting note']);
  const compareBtn = el('button', { class: 'btn', type: 'button' }, ['Compare']);

  const nameEl = el('div', { class: 'drill-note' });
  const notesEl = el('div', { class: 'now-detail' });
  const blurbEl = el('div', { class: 'interval-blurb' });

  const direction = () => directionSelect.value as Direction;

  const fillRoots = () => {
    rootSelect.replaceChildren(
      option('random', 'Random each time'),
      ...Array.from({ length: ROOT_HIGH - ROOT_LOW + 1 }, (_, i) =>
        option(String(ROOT_LOW + i), noteName(ROOT_LOW + i)),
      ),
    );
    rootSelect.value = String(root);
  };

  const rollRoot = () => {
    const rng = makeRng(randomSeed());
    root = int(rng, ROOT_LOW, ROOT_HIGH);
    if (rootSelect.value !== 'random') rootSelect.value = String(root);
  };

  /** The two pitches, lower first. */
  const pitches = (iv: IntervalName): [number, number] => [root, root + semitones(iv)];

  const promptFor = (iv: IntervalName, from = root): AudioPrompt => {
    const dur = noteTicks(4);
    const lower = from;
    const upper = from + semitones(iv);
    const order = direction() === 'down' ? [upper, lower] : [lower, upper];
    const notes =
      direction() === 'together'
        ? order.map((midi, i) => ({ midi, start: i * 12, dur: dur * 2 }))
        : order.map((midi, i) => ({ midi, start: i * dur, dur }));
    return { notes, bpm: PROMPT_BPM, label: 'Play' };
  };

  const play = () => {
    if (rootSelect.value === 'random') rollRoot();
    void prompts.play(promptFor(interval), noteLength);
    render();
  };

  /**
   * The chosen interval, then the one it gets mistaken for, from the same
   * root — so the only thing that changes between them is the thing you are
   * trying to hear.
   */
  const compare = () => {
    const first = promptFor(interval);
    const gapTicks = Math.max(...first.notes.map((n) => n.start + n.dur)) + noteTicks(2);
    const second = promptFor(compareTo);
    void prompts.play(
      {
        notes: [...first.notes, ...second.notes.map((n) => ({ ...n, start: n.start + gapTicks }))],
        bpm: PROMPT_BPM,
        label: 'Compare',
      },
      noteLength,
    );
    render();
  };

  // ---- Neck ----
  /** Somewhere comfortable to see both notes, lower note on a low-ish string. */
  const positions = (): { string: number; fret: number; label: string }[] => {
    const [lo, hi] = pitches(interval);
    const place = (midi: number, minString: number): { string: number; fret: number } | null => {
      for (let s = minString; s < STANDARD.openMidi.length; s++) {
        const fret = midi - STANDARD.openMidi[s];
        if (fret >= 0 && fret <= DEFAULT_FRETS) return { string: s, fret };
      }
      return null;
    };
    const low = place(lo, 0);
    if (!low) return [];
    const high = place(hi, low.string);
    const out = [{ ...low, label: noteName(lo, false) }];
    if (high) out.push({ ...high, label: noteName(hi, false) });
    return out;
  };

  const drawNeck = () => {
    if (!active) return;
    fretboard.setMode('marks');
    const [first, second] = positions();
    fretboard.setMarks(
      [
        ...(first ? [{ ...first, style: 'primary' as const }] : []),
        ...(second ? [{ ...second, style: 'secondary' as const }] : []),
      ],
      true,
    );
  };

  // ---- Render ----
  const renderGrid = () => {
    grid.replaceChildren(
      ...INTERVAL_REFERENCE.map((r) => {
        const button = el(
          'button',
          { class: r.interval === interval ? 'interval-chip active' : 'interval-chip', type: 'button' },
          [r.name],
        );
        button.title = `${r.semitones} semitone${r.semitones === 1 ? '' : 's'}`;
        button.addEventListener('click', () => {
          interval = r.interval;
          compareTo = confusableWith(r.interval);
          compareSelect.value = compareTo;
          play();
        });
        return button;
      }),
    );
  };

  const render = () => {
    const reference = referenceFor(interval);
    const [lo, hi] = pitches(interval);
    nameEl.textContent = reference.name;
    const arrow = direction() === 'down' ? '→' : '→';
    const pair =
      direction() === 'down'
        ? `${noteName(hi, false)} ${arrow} ${noteName(lo, false)}`
        : `${noteName(lo, false)} ${arrow} ${noteName(hi, false)}`;
    notesEl.textContent =
      `${pair} · ${reference.semitones} semitone${reference.semitones === 1 ? '' : 's'}` +
      (direction() === 'together' ? ' · played together' : '');
    blurbEl.textContent = reference.blurb;
    compareBtn.textContent = `Compare with ${spell(compareTo)}`;
    renderGrid();
    drawNeck();
  };

  // ---- Wiring ----
  playBtn.addEventListener('click', play);
  rerollBtn.addEventListener('click', () => {
    rollRoot();
    play();
  });
  compareBtn.addEventListener('click', compare);
  rootSelect.addEventListener('change', () => {
    if (rootSelect.value !== 'random') root = Number(rootSelect.value);
    play();
  });
  directionSelect.addEventListener('change', play);
  compareSelect.addEventListener('change', () => {
    compareTo = compareSelect.value as IntervalName;
    render();
  });
  lengthSelect.addEventListener('change', () => {
    noteLength = lengthSelect.value;
    writeNoteLength(noteLength);
    play();
  });

  // ---- Assemble ----
  const element = el('div', { class: 'explorer' }, [
    el('div', { class: 'grid-hint' }, [
      'No marking, no score — somewhere to listen. Pick an interval and play it from as many ' +
        'starting notes as you like, turn it upside down, and put it next to the one you keep ' +
        'mistaking it for.',
    ]),
    grid,
    el('div', { class: 'practice-main' }, [
      el('div', { class: 'practice-now' }, [nameEl, notesEl]),
      el('div', { class: 'practice-timer' }, [playBtn]),
    ]),
    blurbEl,
    el('div', { class: 'trainer-head' }, [
      labeled('From', rootSelect),
      labeled('Direction', directionSelect),
      labeled('Note length', lengthSelect),
      labeled('Compare with', compareSelect),
    ]),
    el('div', { class: 'practice-actions' }, [rerollBtn, compareBtn]),
  ]);

  fillRoots();
  compareSelect.value = compareTo;
  render();

  return {
    element,
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      noteLength = readNoteLength();
      lengthSelect.value = noteLength;
      render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      prompts.stop();
      fretboard.setMarks(null);
    },
    refresh: drawNeck,
  };
}
