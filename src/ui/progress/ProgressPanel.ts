import { EAR_TOPICS, TOPICS } from '../../exercises';
import { TECHNIQUES } from '../../generate/types';
import { downloadLog } from '../../practice/history';
import {
  DEFAULT_GOAL,
  cleanTempos,
  reviewQueue,
  totals,
  trendByDay,
  trendByWeek,
  weekProgress,
  type WeeklyGoal,
} from '../../practice/insights';
import { statsByRef, streakDays, tierFor, type AttemptKind, type ProgressLog } from '../../practice/progress';
import { el, labeled, option, selectEl } from '../dom';
import { accuracyChart, activityChart } from './charts';

export interface ProgressPanel {
  element: HTMLElement;
  activate(): void;
  deactivate(): void;
  refresh(): void;
}

export interface ProgressDeps {
  progress: ProgressLog;
  /** Jump to a topic from the review queue. */
  onReview(ref: string): void;
}

const GOAL_KEY = 'overture.progress.goal';
const ATTEMPT_CHOICES = [40, 80, 120, 200, 300];
const DAY_CHOICES = [2, 3, 4, 5, 6, 7];

/** Everything the log can hold, so the review queue knows what exists. */
function knownRefs(): { id: string; title: string; kind: AttemptKind }[] {
  return [
    ...TOPICS.map((t) => ({ id: t.id, title: t.title, kind: 'theory' as AttemptKind })),
    ...EAR_TOPICS.map((t) => ({ id: t.id, title: t.title, kind: 'ear' as AttemptKind })),
    ...TECHNIQUES.map((t) => ({ id: `technique:${t.id}`, title: t.name, kind: 'technique' as AttemptKind })),
  ];
}

const pct = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`);
const secs = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

/**
 * What the log has to say.
 *
 * Nothing on this screen is stored — every figure is recomputed from the
 * attempt log each time it is opened, so there is no second copy of the truth
 * to drift out of date.
 */
export function createProgressPanel(deps: ProgressDeps): ProgressPanel {
  const { progress, onReview } = deps;
  let active = false;

  const readGoal = (): WeeklyGoal => {
    try {
      const raw = localStorage.getItem(GOAL_KEY);
      if (!raw) return DEFAULT_GOAL;
      const parsed = JSON.parse(raw) as Partial<WeeklyGoal>;
      return {
        attempts: typeof parsed.attempts === 'number' ? parsed.attempts : DEFAULT_GOAL.attempts,
        days: typeof parsed.days === 'number' ? parsed.days : DEFAULT_GOAL.days,
      };
    } catch {
      return DEFAULT_GOAL;
    }
  };
  let goal = readGoal();
  const writeGoal = () => {
    try {
      localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
    } catch {
      // Storage unavailable: the goal just will not survive a reload.
    }
  };

  // ---- Chrome ----
  const headlineEl = el('div', { class: 'progress-headline' });
  const goalEl = el('div', { class: 'progress-goal' });
  const attemptsGoalSelect = selectEl();
  attemptsGoalSelect.append(...ATTEMPT_CHOICES.map((n) => option(String(n), `${n} attempts`)));
  const daysGoalSelect = selectEl();
  daysGoalSelect.append(...DAY_CHOICES.map((n) => option(String(n), `${n} days`)));
  const activityEl = el('div', { class: 'chart-card' });
  const accuracyEl = el('div', { class: 'chart-card' });
  const reviewEl = el('div', { class: 'progress-block' });
  const topicsEl = el('div', { class: 'progress-block' });
  const temposEl = el('div', { class: 'progress-block' });
  const exportBtn = el('button', { class: 'btn', type: 'button' }, ['Export log']);
  exportBtn.addEventListener('click', () => downloadLog());

  const stat = (value: string, label: string): HTMLElement =>
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat-value' }, [value]),
      el('div', { class: 'stat-label' }, [label]),
    ]);

  const card = (title: string, body: Element, note?: string): HTMLElement =>
    el('div', {}, [
      el('div', { class: 'progress-title' }, [title]),
      ...(note ? [el('div', { class: 'progress-note' }, [note])] : []),
      body,
    ]);

  const table = (headers: string[], rows: (string | HTMLElement)[][]): HTMLElement =>
    el('div', { class: 'table-scroll' }, [
      el('table', { class: 'summary-table' }, [
        el('thead', {}, [el('tr', {}, headers.map((h) => el('th', {}, [h])))]),
        el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((c) => el('td', {}, [c]))))),
      ]),
    ]);

  // ---- Render ----
  const render = () => {
    const events = progress.all();
    const now = new Date();
    const all = totals(events);
    const streak = streakDays(events, now);
    const week = weekProgress(events, goal, now);

    headlineEl.replaceChildren(
      stat(String(all.attempts), all.attempts === 1 ? 'attempt logged' : 'attempts logged'),
      stat(pct(all.accuracy), 'overall accuracy'),
      stat(String(all.activeDays), all.activeDays === 1 ? 'day practised' : 'days practised'),
      stat(streak === 0 ? '—' : `${streak}`, streak === 1 ? 'day streak' : 'day streak'),
    );

    attemptsGoalSelect.value = String(goal.attempts);
    daysGoalSelect.value = String(goal.days);
    const bar = (done: number, target: number): HTMLElement => {
      const fraction = Math.min(1, target === 0 ? 1 : done / target);
      return el('div', { class: 'goal-track' }, [
        el('div', { class: `goal-fill${done >= target ? ' met' : ''}`, style: `width:${fraction * 100}%` }),
      ]);
    };
    goalEl.replaceChildren(
      el('div', { class: 'goal-row' }, [
        el('span', { class: 'goal-label' }, [`Attempts ${week.attempts.done} / ${week.attempts.target}`]),
        bar(week.attempts.done, week.attempts.target),
      ]),
      el('div', { class: 'goal-row' }, [
        el('span', { class: 'goal-label' }, [`Days ${week.days.done} / ${week.days.target}`]),
        bar(week.days.done, week.days.target),
      ]),
      el('div', { class: 'progress-note' }, [
        week.met
          ? `Week of ${week.weekOf}: done. Both halves of the goal are met.`
          : `Week of ${week.weekOf}: ${week.attempts.met ? 'attempts done' : `${week.attempts.target - week.attempts.done} attempts to go`}, ` +
            `${week.days.met ? 'days done' : `${week.days.target - week.days.done} more day${week.days.target - week.days.done === 1 ? '' : 's'} to show up`}.`,
      ]),
    );

    activityEl.replaceChildren(
      card('Attempts per day', activityChart(trendByDay(events, 21, now)).element, 'The last three weeks.'),
    );
    accuracyEl.replaceChildren(
      card('Accuracy by week', accuracyChart(trendByWeek(events, 8, now)).element, 'Graded questions only — technique runs are not marked right or wrong.'),
    );

    // ---- Review queue ----
    const queue = reviewQueue(events, knownRefs(), now).slice(0, 5);
    reviewEl.replaceChildren(
      card(
        'Work on these next',
        el(
          'div',
          { class: 'review-list' },
          queue.map((item) => {
            const go = el('button', { class: 'btn', type: 'button' }, ['Open']);
            go.addEventListener('click', () => onReview(item.ref));
            return el('div', { class: 'review-item' }, [
              el('div', {}, [
                el('div', { class: 'review-name' }, [item.label]),
                el('div', { class: 'review-reason' }, [item.reason]),
              ]),
              go,
            ]);
          }),
        ),
        'Ranked by how far short you are, weighted double, plus how long it has been.',
      ),
    );

    // ---- Topic table ----
    const stats = statsByRef(events);
    const rows = knownRefs()
      .map((k) => {
        const s = stats.get(k.id);
        const tier = tierFor(events, k.id);
        return {
          k,
          attempts: s?.attempts ?? 0,
          cells: [
            k.title,
            k.kind,
            String(s?.attempts ?? 0),
            pct(s?.accuracy ?? null),
            secs(s?.medianResponseMs ?? null),
            `${tier.tier}`,
            s?.lastSeen ? new Date(s.lastSeen).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—',
          ],
        };
      })
      .sort((a, b) => b.attempts - a.attempts || a.k.title.localeCompare(b.k.title));
    topicsEl.replaceChildren(
      card(
        'Every topic',
        table(['Topic', 'Kind', 'Attempts', 'Accuracy', 'Median answer', 'Tier', 'Last seen'], rows.map((r) => r.cells)),
      ),
    );

    // ---- Clean tempos ----
    const tempos = cleanTempos(events);
    temposEl.replaceChildren(
      card(
        'Clean technique tempos',
        table(
          ['Technique', 'Best clean', 'Most recent', 'Clean runs'],
          tempos.map((t) => [t.label, t.best ? `${t.best} BPM` : '—', t.latest ? `${t.latest} BPM` : '—', String(t.runs)]),
        ),
        'Logged when you press “Played it clean” on the Technique tab.',
      ),
    );
  };

  attemptsGoalSelect.addEventListener('change', () => {
    goal = { ...goal, attempts: Number(attemptsGoalSelect.value) };
    writeGoal();
    render();
  });
  daysGoalSelect.addEventListener('change', () => {
    goal = { ...goal, days: Number(daysGoalSelect.value) };
    writeGoal();
    render();
  });

  const element = el('div', { class: 'group progress-group' }, [
    headlineEl,
    el('div', { class: 'progress-block' }, [
      el('div', { class: 'progress-title' }, ['This week']),
      el('div', { class: 'trainer-head' }, [labeled('Target', attemptsGoalSelect), labeled('Across', daysGoalSelect)]),
      goalEl,
    ]),
    el('div', { class: 'chart-row' }, [activityEl, accuracyEl]),
    reviewEl,
    topicsEl,
    temposEl,
    el('div', { class: 'practice-actions' }, [exportBtn]),
  ]);

  render();

  return {
    element,
    activate() {
      active = true;
      goal = readGoal();
      render();
    },
    deactivate() {
      active = false;
    },
    refresh() {
      if (active) render();
    },
  };
}
