import { downloadLog, readLog } from '../practice/history';
import { el, labeled, option } from './dom';
import { createImprovRoutine } from './routines/improvRoutine';
import { createThreeNpsRoutine } from './routines/threeNpsRoutine';
import type { PracticeDeps, Routine } from './routines/types';

export interface PracticePanel {
  element: HTMLElement;
  /** The Practice tab opened: the selected routine takes over the neck. */
  activate(): void;
  /** The Practice tab closed: abandon any running attempt and restore the neck. */
  deactivate(): void;
  /** Redraw the selected routine's neck (after something else touched it). */
  refresh(): void;
  /** The shared transport settings changed elsewhere. */
  syncTransport(): void;
}

/** Practice tab: a routine picker with one routine visible at a time. */
export function createPracticePanel(deps: PracticeDeps): PracticePanel {
  const routines: Routine[] = [createThreeNpsRoutine(deps), createImprovRoutine(deps)];
  let current = routines[0];
  let active = false;

  const routineSelect = document.createElement('select');
  routineSelect.className = 'select';
  for (const routine of routines) routineSelect.append(option(routine.id, routine.name));

  const showCurrent = () => {
    for (const routine of routines) routine.element.classList.toggle('hidden', routine !== current);
  };

  routineSelect.addEventListener('change', () => {
    const next = routines.find((r) => r.id === routineSelect.value);
    if (!next || next === current) return;
    if (active) current.deactivate();
    current = next;
    showCurrent();
    if (active) current.activate();
  });
  showCurrent();

  // The on-screen list is per-visit, so the long-term log gets its own control.
  const exportBtn = el('button', { class: 'btn', type: 'button' }, ['Export log']);
  const logCountEl = el('span', { class: 'log-count' });
  exportBtn.addEventListener('click', () => downloadLog());

  const renderLogCount = () => {
    const log = readLog();
    const total = log['3nps'].length + log.improv.length;
    logCountEl.textContent = total === 0 ? 'No saved practice yet' : `${total} entries saved`;
    exportBtn.disabled = total === 0;
  };

  const element = el('div', { class: 'group trainer-group practice-group' }, [
    el('div', { class: 'trainer-head' }, [
      labeled('Routine', routineSelect),
      el('div', { class: 'log-controls' }, [exportBtn, logCountEl]),
    ]),
    ...routines.map((r) => r.element),
  ]);

  return {
    element,
    activate() {
      active = true;
      renderLogCount();
      current.activate();
    },
    deactivate() {
      if (!active) return;
      active = false;
      current.deactivate();
      // Leaving the tab wipes every routine's on-screen list; the long-term
      // log in localStorage keeps the completed sessions.
      for (const routine of routines) routine.clearHistory?.();
      renderLogCount();
    },
    refresh: () => current.refresh(),
    syncTransport: () => current.syncTransport?.(),
  };
}
