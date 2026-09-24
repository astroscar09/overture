import type { Chord } from '../music/chords';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface DiagramOptions {
  scale?: number;
  showFingers?: boolean;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Render a standard vertical chord chart. Strings run left→right from the low E
 * (6th) to the high E (1st); frets run top→bottom. X/O markers sit above the nut.
 */
export function renderChordDiagram(chord: Chord, opts: DiagramOptions = {}): SVGSVGElement {
  const scale = opts.scale ?? 1;
  const showFingers = opts.showFingers ?? true;
  const strings = chord.frets.length; // 6
  const baseFret = chord.baseFret ?? 1;

  const maxFret = Math.max(0, ...chord.frets.filter((f) => f > 0).map((f) => f - baseFret + 1));
  const displayFrets = Math.max(4, maxFret);

  const cw = 16 * scale; // string spacing
  const rh = 20 * scale; // fret spacing
  const padL = 14 * scale;
  const padR = 14 * scale;
  const padTop = 24 * scale; // room for x/o markers
  const padBot = 10 * scale;
  const dotR = cw * 0.36;

  const width = padL + (strings - 1) * cw + padR;
  const height = padTop + displayFrets * rh + padBot;

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chord-diagram' });

  const stringX = (i: number) => padL + i * cw;
  const fretY = (f: number) => padTop + f * rh;
  const gridRight = stringX(strings - 1);

  // Fret lines.
  for (let f = 0; f <= displayFrets; f++) {
    root.appendChild(svg('line', { x1: padL, y1: fretY(f), x2: gridRight, y2: fretY(f), class: 'cd-fret' }));
  }
  // Nut when in open position.
  if (baseFret === 1) {
    root.appendChild(svg('line', { x1: padL, y1: fretY(0), x2: gridRight, y2: fretY(0), class: 'cd-nut' }));
  } else {
    const label = svg('text', { x: padL - 6 * scale, y: fretY(0.5), class: 'cd-basefret' });
    label.textContent = `${baseFret}fr`;
    root.appendChild(label);
  }
  // Strings.
  for (let i = 0; i < strings; i++) {
    root.appendChild(svg('line', { x1: stringX(i), y1: fretY(0), x2: stringX(i), y2: fretY(displayFrets), class: 'cd-string' }));
  }

  // X / O markers above the nut.
  chord.frets.forEach((fret, i) => {
    if (fret > 0) return;
    const x = stringX(i);
    const y = padTop - 8 * scale;
    if (fret === -1) {
      const t = svg('text', { x, y: y + 4 * scale, class: 'cd-mark' });
      t.textContent = '×';
      root.appendChild(t);
    } else {
      root.appendChild(svg('circle', { cx: x, cy: y, r: dotR * 0.6, class: 'cd-open' }));
    }
  });

  // Finger dots.
  chord.frets.forEach((fret, i) => {
    if (fret <= 0) return;
    const rel = fret - baseFret + 1;
    if (rel < 1 || rel > displayFrets) return;
    const cx = stringX(i);
    const cy = padTop + (rel - 0.5) * rh;
    root.appendChild(svg('circle', { cx, cy, r: dotR, class: 'cd-dot' }));
    const finger = chord.fingers?.[i];
    if (showFingers && finger && finger > 0) {
      const t = svg('text', { x: cx, y: cy, class: 'cd-finger' });
      t.textContent = String(finger);
      root.appendChild(t);
    }
  });

  return root;
}
