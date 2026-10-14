import { EAR_TOPICS } from '../../exercises';
import type { Fretboard } from '../../fretboard/Fretboard';
import type { ProgressLog } from '../../practice/progress';
import { createQuestionPanel } from '../questions/QuestionPanel';
import { el } from '../dom';
import { createIntervalExplorer } from './IntervalExplorer';

export interface EarPanel {
  element: HTMLElement;
  selectTopic(id: string): boolean;
  activate(): void;
  deactivate(): void;
  refresh(): void;
}

type Mode = 'practise' | 'explore';

/**
 * Ear training has two halves that want different things from the screen.
 *
 * Practise asks a question and marks the answer. Explore asks nothing — it is
 * where you go to find out what a major 6th actually sounds like before being
 * tested on it. They share the neck and the note-length setting, so only one
 * can be live at a time.
 */
export function createEarPanel(deps: { fretboard: Fretboard; progress: ProgressLog }): EarPanel {
  const { fretboard, progress } = deps;

  let mode: Mode = 'practise';
  let active = false;

  const practise = createQuestionPanel({ fretboard, progress, topics: EAR_TOPICS, kind: 'ear' });
  const explore = createIntervalExplorer({ fretboard });

  const buttons: Record<Mode, HTMLButtonElement> = {
    practise: el('button', { class: 'mode-tab', type: 'button' }, ['Practise']),
    explore: el('button', { class: 'mode-tab', type: 'button' }, ['Explore sounds']),
  };

  const show = (next: Mode) => {
    if (active && next !== mode) {
      // Whichever side is leaving hands back the neck before the other takes it.
      (mode === 'practise' ? practise : explore).deactivate();
    }
    mode = next;
    for (const key of Object.keys(buttons) as Mode[]) {
      buttons[key].classList.toggle('active', key === mode);
      buttons[key].setAttribute('aria-selected', String(key === mode));
    }
    practise.element.classList.toggle('hidden', mode !== 'practise');
    explore.element.classList.toggle('hidden', mode !== 'explore');
    if (active) (mode === 'practise' ? practise : explore).activate();
  };

  for (const key of Object.keys(buttons) as Mode[]) {
    buttons[key].addEventListener('click', () => show(key));
  }

  const element = el('div', { class: 'ear-panel' }, [
    el('div', { class: 'mode-tabs', role: 'tablist' }, [buttons.practise, buttons.explore]),
    practise.element,
    explore.element,
  ]);

  show('practise');

  return {
    element,
    selectTopic(id) {
      // A review always lands on the quiz, never the listening page.
      show('practise');
      return practise.selectTopic(id);
    },
    activate() {
      active = true;
      (mode === 'practise' ? practise : explore).activate();
    },
    deactivate() {
      if (!active) return;
      active = false;
      practise.deactivate();
      explore.deactivate();
    },
    refresh() {
      (mode === 'practise' ? practise : explore).refresh();
    },
  };
}
