import { NOTE_LENGTHS, PromptPlayer, readNoteLength, writeNoteLength } from '../../audio/promptPlayer';
import { DEFAULT_FRETS, type Fretboard, type MarkStyle } from '../../fretboard/Fretboard';
import { makeRng, randomSeed } from '../../generate/rng';
import {
  fretKey,
  generateQuestion,
  grade,
  type Grade,
  type TheoryQuestion,
  type TheoryTopic,
} from '../../exercises/types';
import { tierFor, type ProgressLog } from '../../practice/progress';
import { el, labeled, option, selectEl } from '../dom';

export interface QuestionPanel {
  element: HTMLElement;
  /** Switch to a topic by id. Used by the review queue. */
  selectTopic(id: string): boolean;
  /** The Theory tab opened: take over the neck. */
  activate(): void;
  /** The Theory tab closed: hand the neck back. */
  deactivate(): void;
  refresh(): void;
}

export interface QuestionPanelDeps {
  fretboard: Fretboard;
  progress: ProgressLog;
  /** The topics this panel offers. */
  topics: TheoryTopic[];
  /** Distinguishes the panel's markup and its rows in the log. */
  kind: 'theory' | 'ear';
}

interface SessionTally {
  asked: number;
  correct: number;
}

/**
 * One question at a time: asked, answered, explained, recorded.
 *
 * Theory Lab and Ear Training are the same loop with different questions, so
 * they are the same panel. The only thing an ear question adds is a sound to
 * play, and that arrives as data on the question like everything else.
 *
 * The tier is not a setting — it is read back from what has actually been
 * answered, so the difficulty follows the player rather than the other way
 * round. The reason is shown on screen, because a level that moves for
 * invisible reasons is just noise.
 */
export function createQuestionPanel(deps: QuestionPanelDeps): QuestionPanel {
  const { fretboard, progress, topics, kind } = deps;

  let active = false;
  let topic: TheoryTopic = topics[0];
  let question: TheoryQuestion | null = null;
  let selection: string[] = [];
  let result: Grade | null = null;
  let askedAt = 0;
  /** Where the player clicked, in order, so the neck can show it back. */
  let clickedSpots: { string: number; fret: number }[] = [];
  let tally: SessionTally = { asked: 0, correct: 0 };
  let unsubscribeNeck: (() => void) | null = null;
  let replays = 0;
  const prompts = new PromptPlayer();

  // How long each note is held. Remembered between sessions and shared with
  // the interval explorer: it is a preference about your ears, not about the
  // question in front of you.
  let noteLength = readNoteLength();

  // ---- Chrome ----
  const topicSelect = selectEl();
  topicSelect.append(...topics.map((t) => option(t.id, t.title)));
  const lengthSelect = selectEl();
  lengthSelect.append(...NOTE_LENGTHS.map((l) => option(l.id, l.name)));
  lengthSelect.value = noteLength;
  const lengthField = labeled('Note length', lengthSelect);

  const blurbEl = el('div', { class: 'grid-hint' });
  const tierEl = el('div', { class: 'drill-stats' });
  const promptEl = el('div', { class: 'theory-prompt' });
  const contextEl = el('div', { class: 'now-detail' });
  const answerEl = el('div', { class: 'theory-answer' });
  const feedbackEl = el('div', { class: 'theory-feedback hidden' });
  // Not primary: Check is the button that moves the question on.
  const playBtn = el('button', { class: 'btn', type: 'button' }, ['Play']);
  const checkBtn = el('button', { class: 'btn primary', type: 'button' }, ['Check']);
  const nextBtn = el('button', { class: 'btn', type: 'button' }, ['Next question']);
  const statsEl = el('div', { class: 'drill-stats' });

  const tierNow = () => tierFor(progress.all(), topic.id);

  /** `counted` is false when the replay was not the player's doing. */
  const playPrompt = (counted = true) => {
    if (!question?.audio) return;
    if (counted) replays += 1;
    void prompts.play(question.audio, noteLength);
    render();
  };

  // ---- Neck ----
  const drawNeck = () => {
    if (!active) return;
    fretboard.setMode('marks');
    if (!question?.fretboard) {
      // A written question gets a quiet neck. Ninety-six note names above the
      // prompt compete with it, and for a spelling question they would answer it.
      fretboard.setMarks([]);
      return;
    }

    // A question can use the neck two ways: to be answered on, or just to show
    // what it is talking about. Only the first kind takes clicks.
    const interactive = question.mode === 'fretboard-select';
    const answered = result !== null;
    // A pitch-graded question has no position in its selection, so the marks
    // come from the spots the player actually clicked, tracked alongside.
    const picked = clickedSpots.map((spot, i) => {
      const token = selection[i];
      const right = answered && question!.answer.includes(token);
      const style: MarkStyle = answered ? (right ? 'correct' : 'wrong') : 'secondary';
      return { string: spot.string, fret: spot.fret, style };
    });

    // A question answered on the neck needs the whole neck live underneath
    // the marks: if only the marked spots were visible, the one place you are
    // being asked to find would be the one place you could not click.
    fretboard.setMarks([
      ...question.fretboard.marks,
      // The right spots are revealed only once the answer is in.
      ...(interactive && answered
        ? question.fretboard.targets.map((t) => ({ string: t.string, fret: t.fret, style: 'target' as const }))
        : []),
      ...(interactive ? picked : []),
    ], interactive);
  };

  // ---- Answer widgets ----
  const renderChoices = (): HTMLElement => {
    const multi = question!.mode === 'multiple-select';
    const buttons = (question!.choices ?? []).map((c) => {
      const picked = selection.includes(c.id);
      const classes = ['theory-choice', picked ? 'picked' : ''].filter(Boolean).join(' ');
      const button = el('button', { class: classes, type: 'button' }, [c.label]);
      if (result) {
        button.disabled = true;
        if (question!.answer.includes(c.id)) button.classList.add('is-answer');
        else if (picked) button.classList.add('is-wrong');
      }
      button.addEventListener('click', () => {
        if (result) return;
        selection = multi
          ? picked
            ? selection.filter((s) => s !== c.id)
            : [...selection, c.id]
          : [c.id];
        render();
      });
      return button;
    });
    return el('div', { class: 'theory-choices' }, buttons);
  };

  const renderSequence = (): HTMLElement => {
    const chosen = el(
      'div',
      { class: 'theory-sequence' },
      selection.length
        ? selection.map((id, i) =>
            (() => {
              const b = el('button', { class: 'theory-chip', type: 'button' }, [`${i + 1}. ${id}`]);
              b.disabled = result !== null;
              b.addEventListener('click', () => {
                selection = selection.filter((_, idx) => idx !== i);
                render();
              });
              return b;
            })(),
          )
        : [el('span', { class: 'theory-placeholder' }, ['Click notes below, in order.'])],
    );
    const pool = el(
      'div',
      { class: 'theory-pool' },
      (question!.pool ?? []).map((c) => {
        const used = selection.includes(c.id);
        const b = el('button', { class: used ? 'theory-chip used' : 'theory-chip', type: 'button' }, [c.label]);
        b.disabled = used || result !== null;
        b.addEventListener('click', () => {
          selection = [...selection, c.id];
          render();
        });
        return b;
      }),
    );
    return el('div', {}, [chosen, pool]);
  };

  const renderAnswerArea = () => {
    if (!question) {
      answerEl.replaceChildren();
      return;
    }
    if (question.mode === 'build-sequence') answerEl.replaceChildren(renderSequence());
    else if (question.mode === 'fretboard-select') {
      const wanted = question.matching === 'ordered' ? question.answer.length : 1;
      const clear = el('button', { class: 'btn', type: 'button' }, ['Clear']);
      clear.disabled = selection.length === 0 || result !== null;
      clear.addEventListener('click', () => {
        selection = [];
        clickedSpots = [];
        render();
      });
      answerEl.replaceChildren(
        el('div', { class: 'theory-fretboard-answer' }, [
          el('span', { class: 'theory-placeholder' }, [
            wanted === 1
              ? selection.length
                ? 'One spot picked — Check it, or click elsewhere to change your mind.'
                : 'Click it on the neck above.'
              : `${selection.length} of ${wanted} notes picked, in order.`,
          ]),
          ...(selection.length ? [clear] : []),
        ]),
      );
    } else answerEl.replaceChildren(renderChoices());
  };

  // ---- Render ----
  const render = () => {
    blurbEl.textContent = topic.blurb;
    const { tier, reason } = tierNow();
    tierEl.textContent = `Tier ${tier} of ${topic.maxTier} · ${reason}`;

    promptEl.textContent = question?.prompt ?? '';
    contextEl.textContent = question?.context ?? '';
    renderAnswerArea();

    feedbackEl.classList.toggle('hidden', result === null);
    if (result) {
      feedbackEl.classList.toggle('is-correct', result.correct);
      feedbackEl.replaceChildren(
        el('div', { class: 'theory-verdict' }, [result.correct ? 'Correct' : 'Not quite']),
        el('div', { class: 'theory-rationale' }, [result.rationale]),
        ...(result.diagnosis ? [el('div', { class: 'theory-diagnosis' }, [result.diagnosis])] : []),
      );
    }

    const hasAudio = question?.audio !== undefined;
    playBtn.classList.toggle('hidden', !hasAudio);
    lengthField.classList.toggle('hidden', !hasAudio);
    playBtn.textContent = replays > 1 ? `Play again (${replays})` : 'Play again';
    checkBtn.disabled = result !== null || selection.length === 0;
    checkBtn.classList.toggle('hidden', result !== null);
    nextBtn.classList.toggle('hidden', result === null);
    statsEl.textContent = tally.asked
      ? `${tally.correct} of ${tally.asked} this session · ${Math.round((tally.correct / tally.asked) * 100)}%`
      : 'Answer a question to start the session.';
    drawNeck();
  };

  // ---- Flow ----
  const nextQuestion = () => {
    const { tier } = tierNow();
    question = generateQuestion(topic, tier, makeRng(randomSeed()));
    selection = [];
    clickedSpots = [];
    result = null;
    replays = 0;
    askedAt = performance.now();
    render();
    // A question you have to hear should play itself; nobody wants to press
    // Play before every single one.
    if (question.audio) playPrompt(false);
  };

  const check = () => {
    if (!question || result) return;
    result = grade(question, selection);
    tally = { asked: tally.asked + 1, correct: tally.correct + (result.correct ? 1 : 0) };
    progress.record({
      kind,
      ref: topic.id,
      tier: question.tier,
      correct: result.correct,
      responseMs: Math.round(performance.now() - askedAt),
    });
    render();
  };

  playBtn.addEventListener('click', () => playPrompt());
  lengthSelect.addEventListener('change', () => {
    noteLength = lengthSelect.value;
    writeNoteLength(noteLength);
    // Changing the length is a request to hear it that way, but it is not the
    // player failing to recognise it, so it does not count as a replay.
    playPrompt(false);
  });
  checkBtn.addEventListener('click', check);
  nextBtn.addEventListener('click', nextQuestion);
  topicSelect.addEventListener('change', () => {
    topic = topics.find((t) => t.id === topicSelect.value) ?? topics[0];
    tally = { asked: 0, correct: 0 };
    nextQuestion();
  });

  // ---- Assemble ----
  const element = el('div', { class: `group theory-group ${kind}-group` }, [
    el('div', { class: 'trainer-head' }, [labeled('Topic', topicSelect), lengthField]),
    blurbEl,
    el('div', { class: 'theory-question' }, [promptEl, contextEl, answerEl]),
    el('div', { class: 'practice-actions' }, [playBtn, checkBtn, nextBtn]),
    feedbackEl,
    tierEl,
    statsEl,
  ]);

  return {
    element,
    selectTopic(id) {
      const found = topics.find((t) => t.id === id);
      if (!found) return false;
      topic = found;
      topicSelect.value = id;
      tally = { asked: 0, correct: 0 };
      nextQuestion();
      return true;
    },
    activate() {
      active = true;
      fretboard.setFrets(DEFAULT_FRETS);
      // The note length is shared with the interval explorer, so pick up any
      // change made over there rather than keeping a stale copy.
      noteLength = readNoteLength();
      lengthSelect.value = noteLength;
      // Clicking the neck answers a find-it question; it stays a note preview
      // the rest of the time.
      unsubscribeNeck = fretboard.onNoteSelect(({ string, fret, midi }) => {
        if (!active || !question || result || question.mode !== 'fretboard-select') return;
        // A "find the note" question grades the position; a "play it back"
        // question grades the pitch, so any fingering of it counts.
        const token = question.fretboardAnswer === 'pitch' ? String(midi) : fretKey(string, fret);
        // An ordered question is collecting a phrase, so clicks accumulate.
        if (question.matching === 'ordered') {
          selection = [...selection, token];
          clickedSpots = [...clickedSpots, { string, fret }];
          if (selection.length > question.answer.length) {
            selection = selection.slice(-question.answer.length);
            clickedSpots = clickedSpots.slice(-question.answer.length);
          }
        } else {
          selection = [token];
          clickedSpots = [{ string, fret }];
        }
        render();
      });
      if (!question) nextQuestion();
      else render();
    },
    deactivate() {
      if (!active) return;
      active = false;
      prompts.stop();
      unsubscribeNeck?.();
      unsubscribeNeck = null;
      fretboard.setMarks(null);
    },
    refresh: drawNeck,
  };
}
