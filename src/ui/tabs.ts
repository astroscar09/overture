// The tab bar, as a registry.
//
// Overture started with three tabs wired by hand inside controls.ts. With
// Theory Lab, Technique and the rest arriving, that wiring is the thing that
// has to stop growing: a new tab should be one entry in a list, not another
// branch in a switch.
//
// This owns only the mechanical part — which panel is shown, which button
// looks active, what assistive technology is told. Everything a tab needs to
// do on the way in or out (handing over the neck, enabling the trainer) stays
// with the feature, in the `onChange` callback.

import { el } from './dom';

export interface TabDef {
  id: string;
  label: string;
  /** The panel to show while this tab is current. */
  panel: HTMLElement;
}

export interface TabBar {
  /** The tablist element, to mount above the panels. */
  element: HTMLElement;
  /** Panels in declaration order, for mounting. */
  panels: HTMLElement[];
  setTab(id: string): void;
  readonly current: string | null;
}

/**
 * `onChange` runs after the panels have been swapped, with the tab being left
 * (null on the first selection) so a feature can hand back anything it owns.
 */
export function createTabBar(tabs: TabDef[], onChange: (to: string, from: string | null) => void): TabBar {
  if (!tabs.length) throw new Error('createTabBar: no tabs');

  let current: string | null = null;

  const buttons = new Map<string, HTMLButtonElement>();
  for (const tab of tabs) {
    const button = el('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': 'false' }, [tab.label]);
    button.addEventListener('click', () => setTab(tab.id));
    buttons.set(tab.id, button);
  }

  const element = el('div', { class: 'tab-bar', role: 'tablist' }, [...buttons.values()]);

  function setTab(id: string): void {
    const target = tabs.find((t) => t.id === id);
    if (!target) throw new Error(`No such tab: ${id}`);
    const from = current;
    current = id;
    for (const tab of tabs) {
      const active = tab.id === id;
      tab.panel.classList.toggle('hidden', !active);
      const button = buttons.get(tab.id);
      button?.classList.toggle('active', active);
      button?.setAttribute('aria-selected', String(active));
    }
    onChange(id, from);
  }

  return {
    element,
    panels: tabs.map((t) => t.panel),
    setTab,
    get current() {
      return current;
    },
  };
}
