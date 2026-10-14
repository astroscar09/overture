// Two small charts for the progress dashboard.
//
// Each is single-series and single-axis on purpose. Activity and accuracy are
// different measures on different scales, so they get two charts rather than
// one with two y-axes — which is the chart mistake that makes a dashboard
// lie to you.
//
// The mark colours are the app's amber and ice stepped down into the dark
// mode's lightness band. A 12px dot at full brightness reads as an accent; a
// bar the height of the panel at the same lightness glares. Same hues, so
// "amber means the thing you did" still holds across the app.

import type { TrendPoint } from '../../practice/insights';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const CHART_AMBER = '#c08214';
export const CHART_ICE = '#2a8fc8';

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

const shortDay = (iso: string): string => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export interface Chart {
  element: SVGSVGElement;
}

const WIDTH = 520;
const HEIGHT = 128;
/** Room for the widest y-axis label the chart will print. "100%" needs more
 *  than a two-digit count does, and a clipped axis label is worse than none. */
const PAD_COUNT = 30;
const PAD_PERCENT = 44;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
/** Bars are capped rather than filling their slot, so the band keeps some air. */
const MAX_BAR = 22;
const SURFACE_GAP = 2;

/** Attempts per day. Magnitude over time, so: bars from a single baseline. */
export function activityChart(points: readonly TrendPoint[]): Chart {
  const PAD_LEFT = PAD_COUNT;
  const svg = el('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'chart',
    role: 'img',
    'aria-label': `Attempts per day over the last ${points.length} days`,
  });
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const peak = Math.max(1, ...points.map((p) => p.attempts));
  const slot = plotW / Math.max(1, points.length);
  const barW = Math.min(MAX_BAR, slot - SURFACE_GAP);
  const baseline = PAD_TOP + plotH;

  // Two recessive gridlines: the peak and halfway.
  for (const frac of [0, 0.5, 1]) {
    const y = baseline - plotH * frac;
    svg.append(el('line', { x1: PAD_LEFT, y1: y, x2: WIDTH - PAD_RIGHT, y2: y, class: 'chart-grid' }));
    if (frac > 0) {
      svg.append(el('text', { x: PAD_LEFT - 6, y: y + 3, class: 'chart-axis chart-axis-y' }, String(Math.round(peak * frac))));
    }
  }

  points.forEach((point, i) => {
    const x = PAD_LEFT + i * slot + (slot - barW) / 2;
    const h = point.attempts === 0 ? 0 : Math.max(3, (point.attempts / peak) * plotH);
    if (h > 0) {
      // Rounded at the data end, square at the baseline.
      const r = Math.min(4, h, barW / 2);
      const top = baseline - h;
      svg.append(
        el('path', {
          d: `M ${x} ${baseline} L ${x} ${top + r} Q ${x} ${top} ${x + r} ${top} L ${x + barW - r} ${top} Q ${x + barW} ${top} ${x + barW} ${top + r} L ${x + barW} ${baseline} Z`,
          class: 'chart-bar',
        }),
      );
    }
    // A hit target wider than the mark, carrying the tooltip.
    const hit = el('rect', { x: PAD_LEFT + i * slot, y: PAD_TOP, width: slot, height: plotH, class: 'chart-hit' });
    hit.append(el('title', {}, `${point.period}: ${point.attempts} attempt${point.attempts === 1 ? '' : 's'}`));
    svg.append(hit);
    // Label the ends and the middle only, so the axis never collides.
    if (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) {
      svg.append(el('text', { x: x + barW / 2, y: HEIGHT - 7, class: 'chart-axis' }, shortDay(point.period)));
    }
  });

  return { element: svg };
}

/** Accuracy per week. Change over time, so: a line with markers. */
export function accuracyChart(points: readonly TrendPoint[]): Chart {
  const PAD_LEFT = PAD_PERCENT;
  const svg = el('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'chart',
    role: 'img',
    'aria-label': `Accuracy per week over the last ${points.length} weeks`,
  });
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD_LEFT + i * step;
  // Accuracy is a proportion, so the axis is always the full 0–100%.
  const y = (value: number) => baseline - value * plotH;

  for (const frac of [0, 0.5, 1]) {
    svg.append(el('line', { x1: PAD_LEFT, y1: y(frac), x2: WIDTH - PAD_RIGHT, y2: y(frac), class: 'chart-grid' }));
    svg.append(el('text', { x: PAD_LEFT - 6, y: y(frac) + 3, class: 'chart-axis chart-axis-y' }, `${frac * 100}%`));
  }

  // Weeks with nothing graded have no value; the line bridges them rather
  // than dropping to zero, which would read as "got everything wrong".
  const known = points.map((p, i) => ({ i, p })).filter(({ p }) => p.accuracy !== null);
  if (known.length > 1) {
    svg.append(
      el('path', {
        d: known.map(({ i, p }, n) => `${n === 0 ? 'M' : 'L'} ${x(i)} ${y(p.accuracy as number)}`).join(' '),
        class: 'chart-line',
      }),
    );
  }
  for (const { i, p } of known) {
    svg.append(el('circle', { cx: x(i), cy: y(p.accuracy as number), r: 4.5, class: 'chart-dot' }));
  }

  points.forEach((point, i) => {
    const hit = el('rect', { x: x(i) - step / 2, y: PAD_TOP, width: Math.max(step, 12), height: plotH, class: 'chart-hit' });
    hit.append(
      el('title', {}, point.accuracy === null
        ? `Week of ${point.period}: nothing graded`
        : `Week of ${point.period}: ${Math.round(point.accuracy * 100)}% over ${point.attempts} attempts`),
    );
    svg.append(hit);
    if (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) {
      svg.append(el('text', { x: x(i), y: HEIGHT - 7, class: 'chart-axis' }, shortDay(point.period)));
    }
  });

  return { element: svg };
}

/** Exported for tests: the left padding each chart reserves for its axis. */
export const AXIS_PADDING = { count: PAD_COUNT, percent: PAD_PERCENT };
