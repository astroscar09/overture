import { renderChordDiagram } from '../fretboard/ChordDiagram';
import type { Chord } from '../music/chords';
import type { TrainerView } from '../trainer/ChordTrainer';

interface Opts {
  onPlayChord?: (chord: Chord) => void;
}

function div(cls: string, ...children: (Node | string)[]): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.append(...children);
  return d;
}

/**
 * Builds the "NOW / NEXT" chord display shown above the fretboard and returns an
 * updater. Diagrams are only re-rendered when the chord actually changes; the
 * countdown updates every beat.
 */
export function createChordPanel(container: HTMLElement, opts: Opts = {}): (view: TrainerView | null) => void {
  const nowDiagram = div('diagram-holder');
  const nowLabel = div('chord-name');
  const nowSlot = div('chord-slot now', div('slot-label', 'Now'), nowDiagram, nowLabel);

  const countdown = div('countdown');
  const pips = div('pips');
  const center = div('chord-center', div('arrow', '→'), countdown, pips);

  const nextDiagram = div('diagram-holder');
  const nextLabel = div('chord-name');
  const nextSlot = div('chord-slot next', div('slot-label', 'Next'), nextDiagram, nextLabel);

  const trainerBox = div('chord-trainer', nowSlot, center, nextSlot);
  const hint = div('chord-hint', 'Enable the chord trainer and add chords to start drilling changes.');

  container.replaceChildren(trainerBox, hint);

  let lastCurrent = '';
  let lastNext = '';

  const renderSlot = (holder: HTMLElement, labelEl: HTMLElement, chord: Chord | null, scale: number) => {
    holder.replaceChildren(...(chord ? [renderChordDiagram(chord, { scale })] : []));
    labelEl.textContent = chord?.name ?? '';
    if (chord && opts.onPlayChord) {
      holder.classList.add('playable');
      holder.onclick = () => opts.onPlayChord?.(chord);
    } else {
      holder.classList.remove('playable');
      holder.onclick = null;
    }
  };

  return function update(view: TrainerView | null): void {
    const show = view != null && view.current != null;
    trainerBox.classList.toggle('hidden', !show);
    hint.classList.toggle('hidden', show);
    if (!view || !view.current) return;

    if (view.current.name !== lastCurrent) {
      renderSlot(nowDiagram, nowLabel, view.current, 1.35);
      lastCurrent = view.current.name;
    }
    const nextName = view.next?.name ?? '';
    if (nextName !== lastNext) {
      renderSlot(nextDiagram, nextLabel, view.next ?? null, 1);
      lastNext = nextName;
    }

    countdown.textContent = view.running ? `change in ${view.beatsRemaining}` : 'ready';
    trainerBox.classList.toggle('changing', view.running && view.beatsRemaining === 1);
    pips.replaceChildren(
      ...Array.from({ length: view.beatsPerChord }, (_, i) => {
        const p = document.createElement('span');
        const state = i < view.beatsElapsed ? 'done' : i === view.beatsElapsed && view.running ? 'active' : '';
        p.className = `pip ${state}`.trim();
        return p;
      }),
    );
  };
}
