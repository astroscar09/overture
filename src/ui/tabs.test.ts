// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTabBar, type TabDef } from './tabs';

const makeTabs = (): TabDef[] => [
  { id: 'one', label: 'One', panel: document.createElement('div') },
  { id: 'two', label: 'Two', panel: document.createElement('div') },
  { id: 'three', label: 'Three', panel: document.createElement('div') },
];

let tabs: TabDef[];
beforeEach(() => {
  tabs = makeTabs();
});

describe('createTabBar', () => {
  it('renders a button per tab', () => {
    const bar = createTabBar(tabs, () => {});
    const buttons = [...bar.element.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(bar.element.getAttribute('role')).toBe('tablist');
    expect(buttons.every((b) => b.getAttribute('role') === 'tab')).toBe(true);
  });

  it('starts with nothing selected until told', () => {
    const bar = createTabBar(tabs, () => {});
    expect(bar.current).toBeNull();
  });

  it('shows only the current panel', () => {
    const bar = createTabBar(tabs, () => {});
    bar.setTab('two');
    expect(tabs[0].panel.classList.contains('hidden')).toBe(true);
    expect(tabs[1].panel.classList.contains('hidden')).toBe(false);
    expect(tabs[2].panel.classList.contains('hidden')).toBe(true);
  });

  it('marks the active button for sighted and assistive users alike', () => {
    const bar = createTabBar(tabs, () => {});
    bar.setTab('three');
    const buttons = [...bar.element.querySelectorAll('button')];
    expect(buttons.map((b) => b.classList.contains('active'))).toEqual([false, false, true]);
    expect(buttons.map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });

  it('reports where it came from, so a feature can hand things back', () => {
    const onChange = vi.fn();
    const bar = createTabBar(tabs, onChange);
    bar.setTab('one');
    expect(onChange).toHaveBeenLastCalledWith('one', null);
    bar.setTab('two');
    expect(onChange).toHaveBeenLastCalledWith('two', 'one');
  });

  it('swaps the panels before telling the feature, so it sees the new state', () => {
    let hiddenAtCallback: boolean | null = null;
    const bar = createTabBar(tabs, (to) => {
      if (to === 'two') hiddenAtCallback = tabs[1].panel.classList.contains('hidden');
    });
    bar.setTab('two');
    expect(hiddenAtCallback).toBe(false);
  });

  it('switches when a button is clicked', () => {
    const onChange = vi.fn();
    const bar = createTabBar(tabs, onChange);
    (bar.element.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(bar.current).toBe('two');
    expect(onChange).toHaveBeenCalledWith('two', null);
  });

  it('tracks current', () => {
    const bar = createTabBar(tabs, () => {});
    bar.setTab('one');
    expect(bar.current).toBe('one');
    bar.setTab('three');
    expect(bar.current).toBe('three');
  });

  it('refuses an unknown tab instead of blanking the UI', () => {
    const bar = createTabBar(tabs, () => {});
    expect(() => bar.setTab('nope')).toThrow(/No such tab/);
  });

  it('refuses to build with no tabs', () => {
    expect(() => createTabBar([], () => {})).toThrow(/no tabs/);
  });

  it('exposes panels in order for mounting', () => {
    const bar = createTabBar(tabs, () => {});
    expect(bar.panels).toEqual([tabs[0].panel, tabs[1].panel, tabs[2].panel]);
  });
});
