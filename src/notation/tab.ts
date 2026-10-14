// Guitar tab, drawn from a Phrase.
//
// This is a deliberately narrow engraver: one voice, one tab stave, note
// values from a whole down to a thirty-second, plus triplets and sextuplets.
// That is the whole range a technique exercise needs, and it is why this is
// a few hundred lines rather than a notation library.
//
// Pure: a Phrase goes in, an SVG comes out. No audio, no app state.

import { PPQ, barTicks, beatTicks, noteTicks, ticksToValue, type Ticks } from '../music/time';
import type { NoteEvent, Phrase } from '../generate/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LEFT = 34;
const RIGHT = 18;
const TOP = 20;
const STRING_GAP = 20;
const STEM_LENGTH = 30;
const BEAM_GAP = 5;
const BEAM_THICKNESS = 3;
/** Roughly how wide a line of music should come out, whatever it contains. */
const TARGET_WIDTH = 1020;

/**
 * How much room one bar gets. A system fills its line, so a single bar is
 * drawn generously and four bars are drawn tighter, rather than one bar
 * occupying a third of the page and four running off the end of it.
 */
export function barWidthFor(bars: number): number {
  return Math.max(250, Math.min(820, TARGET_WIDTH / Math.max(1, bars)));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The note value a duration is written as, even when it is part of a tuplet:
 * the smallest value that still lasts at least as long. A triplet eighth takes
 * 160 ticks but is written as an eighth — one beam, not two — which is the
 * whole reason this is not just a lookup on the duration.
 */
export function writtenValue(dur: Ticks): 1 | 2 | 4 | 8 | 16 | 32 {
  const values: (1 | 2 | 4 | 8 | 16 | 32)[] = [1, 2, 4, 8, 16, 32];
  let best: 1 | 2 | 4 | 8 | 16 | 32 = 32;
  for (const v of values) if (noteTicks(v) >= dur) best = v;
  return best;
}

/** How many beams or flags a note carries. A quarter has none. */
export function beamCount(dur: Ticks): number {
  const value = writtenValue(dur);
  return Math.max(0, Math.round(Math.log2(value / 4)));
}

/** Notes whose durations are not plain note values are part of a tuplet. */
function isTuplet(group: readonly NoteEvent[]): boolean {
  return group.some((n) => ticksToValue(n.dur) === null);
}

export interface TabView {
  element: SVGSVGElement;
  /** Light up one note, by index into phrase.events. Pass null to clear. */
  highlight(index: number | null): void;
}

export function renderTab(phrase: Phrase): TabView {
  const strings = phrase.tuning.openMidi.length;
  const total = barTicks(phrase.timeSig) * phrase.bars;
  const barWidth = barWidthFor(phrase.bars);
  const width = LEFT + barWidth * phrase.bars + RIGHT;
  const staveHeight = (strings - 1) * STRING_GAP;
  const height = TOP + staveHeight + STEM_LENGTH + 30;

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: 'tab',
    role: 'img',
    'aria-label': `Tab, ${phrase.bars} bars`,
  });

  const x = (tick: Ticks): number => LEFT + (tick / total) * (barWidth * phrase.bars);
  // String 0 (low E) is drawn at the bottom, as tab is always written.
  const y = (string: number): number => TOP + (strings - 1 - string) * STRING_GAP;
  const stemFoot = TOP + staveHeight + STEM_LENGTH;

  // ---- Stave ----
  for (let s = 0; s < strings; s++) {
    svg.append(el('line', { x1: LEFT, y1: y(s), x2: width - RIGHT, y2: y(s), class: 'tab-line' }));
  }
  // "TAB" stacked down the left, as it is printed.
  'TAB'.split('').forEach((letter, i) => {
    svg.append(el('text', { x: 13, y: TOP + staveHeight / 2 - 15 + i * 15, class: 'tab-clef' }, letter));
  });

  // Bar lines, with a heavier one at the end.
  for (let bar = 0; bar <= phrase.bars; bar++) {
    const bx = LEFT + bar * barWidth;
    svg.append(
      el('line', {
        x1: bx, y1: TOP, x2: bx, y2: TOP + staveHeight,
        class: bar === phrase.bars ? 'tab-barline tab-barline-end' : 'tab-barline',
      }),
    );
  }

  // ---- Beat groups, which are also the beaming groups ----
  const beat = beatTicks(phrase.timeSig);
  const groups = new Map<number, NoteEvent[]>();
  for (const e of phrase.events) {
    const index = Math.floor(e.start / beat);
    groups.set(index, [...(groups.get(index) ?? []), e]);
  }

  const noteGroups: SVGGElement[] = new Array(phrase.events.length);

  for (const [, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    const stemmed = group.filter((n) => beamCount(n.dur) > 0);

    // Stems for everything that is not a whole note.
    for (const note of group) {
      if (note.dur >= noteTicks(1)) continue;
      svg.append(
        el('line', {
          x1: x(note.start), y1: TOP + staveHeight + 4,
          x2: x(note.start), y2: stemFoot,
          class: 'tab-stem',
        }),
      );
    }

    // Beams. The primary spans the whole group; each further level spans only
    // the runs of notes fast enough to carry it — which is what makes a gallop
    // look like a gallop.
    if (stemmed.length > 1) {
      const deepest = Math.max(...stemmed.map((n) => beamCount(n.dur)));
      for (let level = 1; level <= deepest; level++) {
        let run: NoteEvent[] = [];
        const flush = () => {
          if (run.length > 1) {
            const by = stemFoot - (level - 1) * (BEAM_THICKNESS + BEAM_GAP);
            svg.append(
              el('rect', {
                x: x(run[0].start),
                y: by - BEAM_THICKNESS,
                width: Math.max(2, x(run[run.length - 1].start) - x(run[0].start)),
                height: BEAM_THICKNESS,
                class: 'tab-beam',
              }),
            );
          } else if (run.length === 1 && level > 1) {
            // A lone fast note inside a slower group gets a stub beam.
            const by = stemFoot - (level - 1) * (BEAM_THICKNESS + BEAM_GAP);
            const dir = run[0] === stemmed[0] ? 1 : -1;
            svg.append(
              el('rect', {
                x: dir > 0 ? x(run[0].start) : x(run[0].start) - 7,
                y: by - BEAM_THICKNESS,
                width: 7, height: BEAM_THICKNESS, class: 'tab-beam',
              }),
            );
          }
          run = [];
        };
        for (const note of stemmed) {
          if (beamCount(note.dur) >= level) run.push(note);
          else flush();
        }
        flush();
      }
    } else if (stemmed.length === 1) {
      // A single beamed note needs a flag instead.
      const note = stemmed[0];
      for (let level = 1; level <= beamCount(note.dur); level++) {
        const by = stemFoot - (level - 1) * (BEAM_THICKNESS + BEAM_GAP);
        svg.append(
          el('rect', { x: x(note.start), y: by - BEAM_THICKNESS, width: 8, height: BEAM_THICKNESS, class: 'tab-beam' }),
        );
      }
    }

    // Tuplet bracket over the group.
    if (isTuplet(group) && group.length > 1) {
      const from = x(group[0].start);
      const to = x(group[group.length - 1].start);
      const ty = stemFoot + 11;
      svg.append(el('path', { d: `M ${from} ${ty - 4} L ${from} ${ty} L ${to} ${ty} L ${to} ${ty - 4}`, class: 'tab-tuplet' }));
      svg.append(el('text', { x: (from + to) / 2, y: ty + 10, class: 'tab-tuplet-number' }, String(group.length)));
    }
  }

  // ---- Fret numbers, slurs and bends ----
  phrase.events.forEach((note, i) => {
    const cx = x(note.start);
    const cy = y(note.string);
    const group = el('g', { class: 'tab-note', 'data-index': String(i) });
    const label = String(note.fret);
    // A box behind the number breaks the string line, as engraved tab does.
    group.append(
      el('rect', { x: cx - 7 - label.length * 2.5, y: cy - 8, width: 14 + label.length * 5, height: 16, class: 'tab-note-bg' }),
      el('text', { x: cx, y: cy, class: 'tab-fret' }, label),
    );
    svg.append(group);
    noteGroups[i] = group;

    // Slur from the previous note when it is hammered or pulled.
    if ((note.attack === 'hammer' || note.attack === 'pull') && i > 0) {
      const prev = phrase.events[i - 1];
      const px = x(prev.start);
      const arcY = cy - 10;
      svg.append(
        el('path', { d: `M ${px} ${arcY} Q ${(px + cx) / 2} ${arcY - 8} ${cx} ${arcY}`, class: 'tab-slur' }),
      );
      svg.append(
        el('text', { x: (px + cx) / 2, y: arcY - 10, class: 'tab-articulation' }, note.attack === 'hammer' ? 'h' : 'p'),
      );
    }

    if (note.bend !== undefined) {
      const top = cy - 20;
      svg.append(el('path', { d: `M ${cx + 8} ${cy - 4} Q ${cx + 16} ${cy - 12} ${cx + 16} ${top}`, class: 'tab-bend' }));
      svg.append(el('path', { d: `M ${cx + 13} ${top + 5} L ${cx + 16} ${top} L ${cx + 19} ${top + 5}`, class: 'tab-bend-tip' }));
      svg.append(
        el('text', { x: cx + 22, y: top + 5, class: 'tab-bend-label' }, note.bend === 2 ? 'full' : '½'),
      );
    }
  });

  let lit: number | null = null;
  return {
    element: svg,
    highlight(index) {
      if (lit !== null) noteGroups[lit]?.classList.remove('playing');
      lit = index;
      if (index !== null) noteGroups[index]?.classList.add('playing');
    },
  };
}

/** Exported for tests: ticks per quarter, so callers need not import two modules. */
export const TICKS_PER_QUARTER = PPQ;
