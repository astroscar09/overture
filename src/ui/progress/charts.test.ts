// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '../../practice/insights';
import { AXIS_PADDING, accuracyChart, activityChart } from './charts';

const days = (counts: number[]): TrendPoint[] =>
  counts.map((attempts, i) => ({
    period: `2026-03-${String(i + 1).padStart(2, '0')}`,
    attempts,
    accuracy: attempts ? 0.5 : null,
    medianResponseMs: attempts ? 2000 : null,
  }));

describe('the activity chart', () => {
  it('draws a bar only for days with something on them', () => {
    const svg = activityChart(days([3, 0, 5, 0, 2])).element;
    expect(svg.querySelectorAll('.chart-bar')).toHaveLength(3);
  });

  it('gives every day a hit target, including the empty ones', () => {
    const svg = activityChart(days([3, 0, 5])).element;
    expect(svg.querySelectorAll('.chart-hit')).toHaveLength(3);
    const titles = [...svg.querySelectorAll('.chart-hit title')].map((t) => t.textContent);
    expect(titles[1]).toMatch(/0 attempts/);
    expect(titles[0]).toMatch(/3 attempts/);
  });

  it('scales to the tallest day', () => {
    const svg = activityChart(days([1, 10])).element;
    const bars = [...svg.querySelectorAll('.chart-bar')].map((b) => b.getAttribute('d') ?? '');
    // Every command in the path takes coordinate pairs, so the y values are
    // the odd-indexed numbers. The taller bar reaches a smaller y.
    const topY = (d: string) => {
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      return Math.min(...nums.filter((_, i) => i % 2 === 1));
    };
    expect(topY(bars[1])).toBeLessThan(topY(bars[0]));
  });

  it('labels only the ends and the middle, so the axis cannot collide', () => {
    const svg = activityChart(days(new Array(21).fill(2))).element;
    expect(svg.querySelectorAll('text.chart-axis:not(.chart-axis-y)')).toHaveLength(3);
  });

  it('survives an empty history without dividing by zero', () => {
    const svg = activityChart(days([0, 0, 0])).element;
    expect(svg.querySelectorAll('.chart-bar')).toHaveLength(0);
    expect(svg.querySelectorAll('.chart-hit')).toHaveLength(3);
  });
});

describe('the accuracy chart', () => {
  const weeks = (values: (number | null)[]): TrendPoint[] =>
    values.map((accuracy, i) => ({
      period: `2026-0${i + 1}-02`,
      attempts: accuracy === null ? 0 : 10,
      accuracy,
      medianResponseMs: null,
    }));

  it('plots a dot per graded week and nothing for the blanks', () => {
    const svg = accuracyChart(weeks([0.5, null, 0.8, 0.9])).element;
    expect(svg.querySelectorAll('.chart-dot')).toHaveLength(3);
  });

  it('bridges a blank week rather than dropping the line to zero', () => {
    const svg = accuracyChart(weeks([0.8, null, 0.8])).element;
    const d = svg.querySelector('.chart-line')!.getAttribute('d')!;
    // Two points, one straight segment — no visit to the floor in between.
    expect(d.split('L')).toHaveLength(2);
  });

  it('draws no line when there is only one graded week', () => {
    const svg = accuracyChart(weeks([null, 0.7])).element;
    expect(svg.querySelector('.chart-line')).toBeNull();
    expect(svg.querySelectorAll('.chart-dot')).toHaveLength(1);
  });

  it('always shows the full 0–100% scale, so a good week cannot look bad', () => {
    const svg = accuracyChart(weeks([0.9, 0.92, 0.95])).element;
    const labels = [...svg.querySelectorAll('.chart-axis-y')].map((t) => t.textContent);
    expect(labels).toEqual(['0%', '50%', '100%']);
  });

  it('reserves enough left padding for a four-character axis label', () => {
    // "100%" at 10px is about 24px wide and is right-anchored at PAD_LEFT - 6.
    expect(AXIS_PADDING.percent).toBeGreaterThan(AXIS_PADDING.count);
    expect(AXIS_PADDING.percent - 6).toBeGreaterThanOrEqual(26);
  });

  it('says so in the tooltip when a week was not graded', () => {
    const svg = accuracyChart(weeks([null, 0.7])).element;
    const titles = [...svg.querySelectorAll('.chart-hit title')].map((t) => t.textContent);
    expect(titles[0]).toMatch(/nothing graded/);
    expect(titles[1]).toMatch(/70% over 10 attempts/);
  });
});
