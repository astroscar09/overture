// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { noteTicks, tupletTicks } from '../music/time';
import { generateExercise } from '../generate/pipeline';
import { TECHNIQUES, type ExerciseSpec, type TechniqueId } from '../generate/types';
import { beamCount, renderTab, writtenValue } from './tab';

const spec = (o: Partial<ExerciseSpec> = {}): ExerciseSpec => ({
  technique: 'alternate', key: 'E', scale: 'minor pentatonic',
  window: [5, 12], bars: 2, difficulty: 3, bpm: 100, seed: 1, ...o,
});

describe('note values', () => {
  it('reads plain durations', () => {
    expect(writtenValue(noteTicks(4))).toBe(4);
    expect(writtenValue(noteTicks(8))).toBe(8);
    expect(writtenValue(noteTicks(16))).toBe(16);
    expect(writtenValue(noteTicks(32))).toBe(32);
  });

  it('writes a tuplet note as the value it looks like, not the time it takes', () => {
    // A triplet eighth lasts 160 ticks but is written as an eighth: one beam.
    expect(writtenValue(tupletTicks(8, 3, 2))).toBe(8);
    expect(beamCount(tupletTicks(8, 3, 2))).toBe(1);
    // A sextuplet sixteenth lasts 80 ticks and carries two beams.
    expect(writtenValue(tupletTicks(16, 6, 4))).toBe(16);
    expect(beamCount(tupletTicks(16, 6, 4))).toBe(2);
  });

  it('counts beams', () => {
    expect(beamCount(noteTicks(4))).toBe(0);
    expect(beamCount(noteTicks(8))).toBe(1);
    expect(beamCount(noteTicks(16))).toBe(2);
    expect(beamCount(noteTicks(32))).toBe(3);
  });
});

describe('rendering', () => {
  it('draws six string lines and the right number of bar lines', () => {
    const { phrase } = generateExercise(spec({ bars: 2 }));
    const { element } = renderTab(phrase);
    expect(element.querySelectorAll('.tab-line')).toHaveLength(6);
    // One at the start of each bar plus the closing line.
    expect(element.querySelectorAll('.tab-barline')).toHaveLength(3);
  });

  it('draws one fret number per note, in order', () => {
    const { phrase } = generateExercise(spec());
    const { element } = renderTab(phrase);
    const frets = [...element.querySelectorAll('.tab-fret')].map((n) => Number(n.textContent));
    expect(frets).toEqual(phrase.events.map((e) => e.fret));
  });

  it('puts the low E at the bottom, as tab is written', () => {
    const { phrase } = generateExercise(spec());
    const { element } = renderTab(phrase);
    const lines = [...element.querySelectorAll('.tab-line')].map((l) => Number(l.getAttribute('y1')));
    // The first line drawn is string 0, which must be the lowest on the page.
    expect(lines[0]).toBe(Math.max(...lines));
  });

  it('places notes left to right in time order', () => {
    const { phrase } = generateExercise(spec());
    const { element } = renderTab(phrase);
    const xs = [...element.querySelectorAll('.tab-fret')].map((n) => Number(n.getAttribute('x')));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('beams a gallop so the two sixteenths share a second beam', () => {
    const { phrase } = generateExercise(spec({ technique: 'gallop' }));
    const { element } = renderTab(phrase);
    // Three notes a beat, so every beat has a primary beam and a secondary
    // over the pair — more beams than there are beats.
    const beams = element.querySelectorAll('.tab-beam').length;
    expect(beams).toBeGreaterThan(phrase.bars * 4);
  });

  it('brackets a tuplet with its number, and leaves a gallop alone', () => {
    // A gallop is three notes to a beat but not a triplet: no bracket.
    const gallop = renderTab(generateExercise(spec({ technique: 'gallop' })).phrase);
    expect(gallop.element.querySelectorAll('.tab-tuplet')).toHaveLength(0);

    // Find a phrase that really does contain a tuplet.
    let withTuplet = null;
    for (let seed = 1; seed <= 40 && !withTuplet; seed++) {
      const { phrase } = generateExercise(spec({ technique: 'legato', difficulty: 3, seed }));
      if (phrase.events.some((e) => e.dur === 160 || e.dur === 80)) withTuplet = phrase;
    }
    expect(withTuplet).not.toBeNull();
    const view = renderTab(withTuplet!);
    expect(view.element.querySelectorAll('.tab-tuplet').length).toBeGreaterThan(0);
    const numbers = [...view.element.querySelectorAll('.tab-tuplet-number')].map((n) => n.textContent);
    expect(numbers.every((n) => n === '3' || n === '6')).toBe(true);
  });

  it('draws a slur and an h or p for every slurred note', () => {
    const { phrase } = generateExercise(spec({ technique: 'legato' }));
    const { element } = renderTab(phrase);
    const slurred = phrase.events.filter((e, i) => i > 0 && (e.attack === 'hammer' || e.attack === 'pull'));
    expect(element.querySelectorAll('.tab-slur')).toHaveLength(slurred.length);
    const marks = [...element.querySelectorAll('.tab-articulation')].map((n) => n.textContent);
    expect(marks.every((m) => m === 'h' || m === 'p')).toBe(true);
  });

  it('draws a bend arrow labelled full or half', () => {
    const { phrase } = generateExercise(spec({ technique: 'bending' }));
    const { element } = renderTab(phrase);
    const bends = phrase.events.filter((e) => e.bend !== undefined);
    expect(element.querySelectorAll('.tab-bend')).toHaveLength(bends.length);
    const labels = [...element.querySelectorAll('.tab-bend-label')].map((n) => n.textContent);
    expect(labels.every((l) => l === 'full' || l === '½')).toBe(true);
  });

  it('renders every technique without throwing', () => {
    for (const technique of TECHNIQUES.map((t) => t.id) as TechniqueId[]) {
      for (let seed = 1; seed <= 8; seed++) {
        const { phrase } = generateExercise(spec({ technique, seed, difficulty: 4 }));
        expect(() => renderTab(phrase)).not.toThrow();
      }
    }
  });
});

describe('the playback cursor', () => {
  it('lights one note at a time and clears', () => {
    const { phrase } = generateExercise(spec());
    const view = renderTab(phrase);
    const lit = () => view.element.querySelectorAll('.tab-note.playing').length;
    expect(lit()).toBe(0);
    view.highlight(3);
    expect(lit()).toBe(1);
    expect(view.element.querySelector('.tab-note.playing')!.getAttribute('data-index')).toBe('3');
    view.highlight(5);
    expect(lit()).toBe(1);
    view.highlight(null);
    expect(lit()).toBe(0);
  });

  it('shrugs off an index that is not there', () => {
    const view = renderTab(generateExercise(spec()).phrase);
    expect(() => view.highlight(9999)).not.toThrow();
  });
});
