import type { CircleDirection, CircleKey } from '../music/circleOfFifths';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SIZE = 196;
const CENTRE = SIZE / 2;
/** Distance from the middle to each key node. */
const RADIUS = 76;
const NODE_RADIUS = 17;
const STEP_DEGREES = 360 / 12;

export interface CircleWheel {
  element: SVGSVGElement;
  /**
   * Redraw for a run: `keys` in playing order, `index` the key being played,
   * and `visited` how many have been played so far (so a second lap can shade
   * the whole wheel).
   */
  update(keys: CircleKey[], index: number, direction: CircleDirection, lap: number, visited: number): void;
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
 * The circle of fifths drawn as a wheel, with the key you started on at the
 * top. Fifths run clockwise and fourths anticlockwise, which is the shape
 * itself rather than a list — the point being to learn the wheel, not the row.
 */
export function createCircleWheel(): CircleWheel {
  const element = svg('svg', {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    width: SIZE,
    height: SIZE,
    class: 'circle-wheel',
    role: 'img',
    'aria-label': 'Circle of fifths',
  });

  return {
    element,
    update(keys, index, direction, lap, visited) {
      const sweep = direction === 'fifths' ? 1 : -1;
      const children: SVGElement[] = [svg('circle', { cx: CENTRE, cy: CENTRE, r: RADIUS, class: 'wheel-ring' })];

      keys.forEach((key, i) => {
        // The start key sits at 12 o'clock; each later key is one step round.
        const angle = ((-90 + sweep * i * STEP_DEGREES) * Math.PI) / 180;
        const cx = CENTRE + RADIUS * Math.cos(angle);
        const cy = CENTRE + RADIUS * Math.sin(angle);

        const classes = ['wheel-key'];
        if (i === index) classes.push('current');
        else if (i === (index + 1) % keys.length) classes.push('next');
        else if (i < visited) classes.push('done');

        const group = svg('g', { class: classes.join(' ') });
        group.append(
          svg('circle', { cx, cy, r: NODE_RADIUS, class: 'wheel-node' }),
          Object.assign(svg('text', { x: cx, y: cy, class: 'wheel-label' }), { textContent: key.name }),
        );
        children.push(group);
      });

      const glyph = direction === 'fifths' ? '↻' : '↺';
      children.push(
        Object.assign(svg('text', { x: CENTRE, y: CENTRE - 7, class: 'wheel-centre-glyph' }), { textContent: glyph }),
        Object.assign(svg('text', { x: CENTRE, y: CENTRE + 13, class: 'wheel-centre-text' }), {
          textContent: `Lap ${lap}`,
        }),
      );

      element.replaceChildren(...children);
    },
  };
}
