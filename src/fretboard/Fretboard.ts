import { noteAt, noteName, pitchClass, type PitchClass } from '../music/notes';
import type { IntervalRole } from '../music/chordTones';
import type { Tuning } from '../music/tuning';
import { playNote } from '../audio/engine';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type DisplayMode = 'all' | 'scale' | 'chord' | 'improv' | 'pattern' | 'marks';

/** Neck length used everywhere except where a view needs more frets. */
export const DEFAULT_FRETS = 15;

// Maps an interval role to the CSS class that colours its note nodes.
const ROLE_CLASS: Record<IntervalRole, string> = {
  R: 'tone-root',
  '3': 'tone-3',
  '5': 'tone-5',
  '7': 'tone-7',
};
const ROLE_CLASSES = Object.values(ROLE_CLASS);

const MARK_CLASSES = [
  'mark-primary', 'mark-secondary', 'mark-ghost', 'mark-target', 'mark-correct', 'mark-wrong',
];

/** Two-chord improv overlay: chord-A / chord-B tones + a dim scale background. */
export interface ImprovSpec {
  chordA: Set<PitchClass>;
  chordB: Set<PitchClass>;
  rootA: PitchClass;
  rootB: PitchClass;
  scale: Set<PitchClass>; // dim background pool (may be empty)
}

/**
 * How a mark is drawn. Shape carries as much of the meaning as colour does, so
 * the neck stays readable to anyone who cannot separate two hues.
 */
export type MarkStyle = 'primary' | 'secondary' | 'ghost' | 'target' | 'correct' | 'wrong';

/**
 * A single annotated spot. Theory Lab, ear training and the technique view all
 * draw through this rather than each adding a display mode of their own.
 */
export interface Mark {
  string: number;
  fret: number;
  /** Replaces the note name inside the dot, e.g. "3" or "R". */
  label?: string;
  style?: MarkStyle;
}

/** A fingering pattern (e.g. a 3NPS scale position): exact string/fret spots. */
export interface PatternSpec {
  notes: { string: number; fret: number }[];
  rootPc: PitchClass;
  start?: { string: number; fret: number }; // ringed as the starting note
}

const spotKey = (string: number, fret: number) => `${string}:${fret}`;

interface FretNode {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  midi: number;
  string: number;
  fret: number;
}

// Frets that carry inlay position markers.
const SINGLE_MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_MARKERS = new Set([12, 24]);

/**
 * Renders an interactive SVG guitar neck. Nodes are drawn once and then shown /
 * hidden / recoloured as the display mode changes, so click handlers stay put.
 * Clicking a node previews its pitch through the audio engine.
 */
export class Fretboard {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private nodes: FretNode[] = [];

  private tuning: Tuning;
  private frets: number;

  private mode: DisplayMode = 'all';
  private rootPc: PitchClass = 0;
  private scaleSet: Set<PitchClass> = new Set();
  // Chord-tone highlight (mode 'chord'): pitch class -> interval role.
  private chordRoles: Map<PitchClass, IntervalRole> | null = null;
  // Optional dim scale background shown behind the chord tones in 'chord' mode.
  private chordScaleSet: Set<PitchClass> | null = null;
  // Two-chord improv overlay (mode 'improv').
  private improv: ImprovSpec | null = null;
  // Fingering pattern (mode 'pattern'): string:fret spots to show.
  private pattern: PatternSpec | null = null;
  private patternSpots: Set<string> = new Set();
  // Annotated spots (mode 'marks'), keyed by string:fret.
  private marks: Map<string, Mark> = new Map();
  // When true, unmarked notes stay visible and clickable behind the marks —
  // which is what an exercise that asks you to find a note needs.
  private marksShowRest = false;
  // Listeners told which spot was clicked, for exercises that ask you to
  // point at the neck. They fire alongside the usual note preview.
  private selectListeners = new Set<(spot: { string: number; fret: number; midi: number }) => void>();
  // When set, a chord shape (fret per string, -1 = muted) overrides the mode.
  private chordShape: number[] | null = null;

  // Geometry (px).
  private readonly marginLeft = 66;
  private readonly marginTop = 30;
  private readonly marginBottom = 26;
  private readonly fretWidth = 62;
  private readonly stringGap = 34;
  private readonly openX = 30;
  private readonly radius = 13;

  constructor(container: HTMLElement, tuning: Tuning, frets = 15) {
    this.container = container;
    this.tuning = tuning;
    this.frets = frets;
    this.render();
  }

  private stringY(stringIndex: number): number {
    // High E (highest index) is drawn on top, low E on the bottom, matching
    // standard TAB / chord-diagram orientation. `stringIndex` stays the true
    // string number (0 = low E) so chord-shape math is unaffected.
    const strings = this.tuning.openMidi.length;
    return this.marginTop + (strings - 1 - stringIndex) * this.stringGap;
  }

  private fretX(fret: number): number {
    // Open strings (fret 0) sit to the left of the nut.
    if (fret === 0) return this.openX;
    return this.marginLeft + (fret - 0.5) * this.fretWidth;
  }

  private el<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number> = {},
  ): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  }

  private render(): void {
    this.nodes = [];
    const strings = this.tuning.openMidi.length;
    const width = this.marginLeft + this.frets * this.fretWidth + 16;
    const height = this.marginTop + (strings - 1) * this.stringGap + this.marginBottom;

    this.svg = this.el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      class: 'fretboard',
      role: 'img',
    });

    const topY = this.stringY(0);
    const bottomY = this.stringY(strings - 1);

    // Position-marker inlays (drawn behind everything else).
    for (let f = 1; f <= this.frets; f++) {
      const x = this.fretX(f);
      const midY = (topY + bottomY) / 2;
      if (DOUBLE_MARKERS.has(f)) {
        this.svg.appendChild(this.el('circle', { cx: x, cy: midY - this.stringGap, r: 4, class: 'inlay' }));
        this.svg.appendChild(this.el('circle', { cx: x, cy: midY + this.stringGap, r: 4, class: 'inlay' }));
      } else if (SINGLE_MARKERS.has(f)) {
        this.svg.appendChild(this.el('circle', { cx: x, cy: midY, r: 4, class: 'inlay' }));
      }
    }

    // Fret wires.
    for (let f = 1; f <= this.frets; f++) {
      const x = this.marginLeft + f * this.fretWidth;
      this.svg.appendChild(this.el('line', { x1: x, y1: topY, x2: x, y2: bottomY, class: 'fret-wire' }));
    }
    // Nut (thick line at fret 0).
    this.svg.appendChild(
      this.el('line', { x1: this.marginLeft, y1: topY, x2: this.marginLeft, y2: bottomY, class: 'nut' }),
    );

    // Strings (thicker toward the low E, now drawn along the bottom).
    for (let s = 0; s < strings; s++) {
      const y = this.stringY(s);
      const thickness = 2.4 - s * 0.28;
      this.svg.appendChild(
        this.el('line', {
          x1: this.openX,
          y1: y,
          x2: width - 8,
          y2: y,
          class: 'string',
          'stroke-width': Math.max(0.8, thickness).toFixed(2),
        }),
      );
    }

    // Fret numbers along the bottom.
    for (let f = 1; f <= this.frets; f++) {
      const t = this.el('text', { x: this.fretX(f), y: height - 8, class: 'fret-number' });
      t.textContent = String(f);
      this.svg.appendChild(t);
    }

    // Note nodes: one per string per fret (including open strings at fret 0).
    for (let s = 0; s < strings; s++) {
      for (let f = 0; f <= this.frets; f++) {
        const midi = noteAt(this.tuning.openMidi[s], f);
        const cx = this.fretX(f);
        const cy = this.stringY(s);

        const group = this.el('g', { class: 'note', tabindex: 0, role: 'button' });
        const circle = this.el('circle', { cx, cy, r: this.radius, class: 'fret-node' });
        const label = this.el('text', { x: cx, y: cy, class: 'note-label' });
        label.textContent = noteName(midi, false);

        group.appendChild(circle);
        group.appendChild(label);

        const play = () => {
          void playNote(noteName(midi, true));
          group.classList.add('active');
          window.setTimeout(() => group.classList.remove('active'), 220);
          for (const listener of [...this.selectListeners]) {
            try {
              listener({ string: s, fret: f, midi });
            } catch (error) {
              console.error('fretboard select listener failed', error);
            }
          }
        };
        group.addEventListener('click', play);
        group.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            play();
          }
        });

        this.svg.appendChild(group);
        this.nodes.push({ group, circle, label, midi, string: s, fret: f });
      }
    }

    this.container.replaceChildren(this.svg);
    this.update();
  }

  private update(): void {
    for (const node of this.nodes) {
      const pc = pitchClass(node.midi);
      let visible = true;
      let isRoot = false;
      let inScale = false;
      let isChord = false;
      let toneRole: IntervalRole | null = null;
      let chordScaleDim = false;
      // Improv-view flags.
      let improvA = false;
      let improvB = false;
      let improvShared = false;
      let improvScale = false;
      let improvRoot = false;
      let patternStart = false;
      let mark: Mark | undefined;

      if (this.chordShape) {
        const shapeFret = this.chordShape[node.string];
        isChord = shapeFret >= 0 && node.fret === shapeFret;
        visible = isChord;
      } else if (this.mode === 'chord' && this.chordRoles) {
        toneRole = this.chordRoles.get(pc) ?? null;
        if (toneRole !== null) {
          visible = true;
        } else if (this.chordScaleSet && this.chordScaleSet.has(pc)) {
          visible = true;
          chordScaleDim = true; // scale note that isn't a chord tone: dim it
        } else {
          visible = false;
        }
      } else if (this.mode === 'improv' && this.improv) {
        const inA = this.improv.chordA.has(pc);
        const inB = this.improv.chordB.has(pc);
        const inImprovScale = this.improv.scale.has(pc);
        visible = inA || inB || inImprovScale;
        improvShared = inA && inB;
        improvA = inA && !inB;
        improvB = inB && !inA;
        improvScale = !inA && !inB && inImprovScale;
        improvRoot = (inA && pc === this.improv.rootA) || (inB && pc === this.improv.rootB);
      } else if (this.mode === 'scale') {
        inScale = this.scaleSet.has(pc);
        visible = inScale;
        isRoot = pc === this.rootPc;
      } else if (this.mode === 'marks') {
        mark = this.marks.get(spotKey(node.string, node.fret));
        visible = mark !== undefined || this.marksShowRest;
      } else if (this.mode === 'pattern') {
        visible = this.patternSpots.has(spotKey(node.string, node.fret));
        inScale = visible;
        isRoot = visible && pc === this.pattern?.rootPc;
        const start = this.pattern?.start;
        patternStart = visible && start !== undefined && start.string === node.string && start.fret === node.fret;
      }

      node.group.classList.toggle('hidden', !visible);
      node.group.classList.toggle('root', isRoot);
      node.group.classList.toggle('in-scale', inScale && !isRoot);
      node.group.classList.toggle('chord', isChord);
      for (const cls of ROLE_CLASSES) node.group.classList.remove(cls);
      if (toneRole) node.group.classList.add(ROLE_CLASS[toneRole]);
      node.group.classList.toggle('chord-scale', chordScaleDim);
      node.group.classList.toggle('improv-a', improvA);
      node.group.classList.toggle('improv-b', improvB);
      node.group.classList.toggle('improv-shared', improvShared);
      node.group.classList.toggle('improv-scale', improvScale);
      node.group.classList.toggle('improv-root', improvRoot);
      node.group.classList.toggle('pattern-start', patternStart);
      for (const cls of MARK_CLASSES) node.group.classList.remove(cls);
      if (mark) node.group.classList.add(`mark-${mark.style ?? 'primary'}`);
      // A mark can relabel its dot; everything else shows the note name.
      const label = mark?.label ?? noteName(node.midi, false);
      if (node.label.textContent !== label) node.label.textContent = label;
    }
  }

  setMode(mode: DisplayMode): void {
    this.mode = mode;
    this.update();
  }

  setScale(rootPc: PitchClass, pitchClasses: Set<PitchClass>): void {
    this.rootPc = rootPc;
    this.scaleSet = pitchClasses;
    this.update();
  }

  /**
   * Highlight a chord's tones across the neck, colour-coded by interval role.
   * Optionally dim-shade a scale behind them (for solo-over-the-changes practice).
   */
  setChordTones(roles: Map<PitchClass, IntervalRole> | null, scale: Set<PitchClass> | null = null): void {
    this.chordRoles = roles;
    this.chordScaleSet = scale;
    this.update();
  }

  /** Two-chord improv overlay (chord A / chord B tones + dim scale), or clear. */
  setImprov(spec: ImprovSpec | null): void {
    this.improv = spec;
    this.update();
  }

  /** Highlight a chord shape (fret per string) over the neck, or clear with null. */
  setChordShape(shape: number[] | null): void {
    this.chordShape = shape;
    this.update();
  }

  /**
   * Show a set of annotated spots (mode 'marks'), or clear with null. This is
   * the general-purpose overlay: anything that needs to point at places on the
   * neck uses it instead of growing another display mode.
   */
  setMarks(marks: Mark[] | null, showRest = false): void {
    this.marks = new Map((marks ?? []).map((m) => [spotKey(m.string, m.fret), m]));
    this.marksShowRest = showRest;
    this.update();
  }

  /** Show exact string/fret spots (mode 'pattern'), or clear with null. */
  setPattern(spec: PatternSpec | null): void {
    this.pattern = spec;
    this.patternSpots = new Set(spec?.notes.map((n) => spotKey(n.string, n.fret)) ?? []);
    this.update();
  }

  /**
   * Be told which spot was clicked. Returns an unsubscribe. Listeners survive
   * a re-render, so changing tuning or neck length does not drop them.
   */
  onNoteSelect(listener: (spot: { string: number; fret: number; midi: number }) => void): () => void {
    this.selectListeners.add(listener);
    return () => void this.selectListeners.delete(listener);
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
    this.render(); // note MIDI numbers change, so rebuild the neck
  }

  /** Change the neck length (rebuilds the neck). */
  setFrets(frets: number): void {
    if (frets === this.frets) return;
    this.frets = frets;
    this.render();
  }
}
