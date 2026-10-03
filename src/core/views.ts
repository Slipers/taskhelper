import { addDays, formatDay, formatLongDay, todayKey, toKey } from './dates';
import type { AppData, DayKey, ID, SortMode, Task, ViewId } from './types';
import { INBOX_ID } from './types';

export interface Section {
  /** Unique dans la vue ; sert aussi à mémoriser le repli. */
  key: string;
  title: string | null;
  subtitle?: string;
  tasks: Task[];
  /** Déposer une tâche ici lui donne ce jour (null = retire la date). */
  dropDate?: DayKey | null;
  /** Déposer une tâche ici la range dans cette liste. */
  dropList?: ID;
  /** Section de tâches terminées : repliable, jamais réordonnable. */
  done?: boolean;
  collapsible?: boolean;
  /** Section affichée même vide (jours de la semaine dans « À venir »). */
  keepEmpty?: boolean;
  /** Valeurs par défaut d'une tâche ajoutée depuis cette section. */
  defaults?: Partial<Task>;
  tone?: 'danger';
}

export interface ViewModel {
  title: string;
  subtitle?: string;
  sections: Section[];
  /** Valeurs par défaut de la saisie rapide en haut de la vue. */
  defaults: Partial<Task>;
  sortable: boolean;
}

export const SMART_VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: 'today', label: 'Aujourd’hui' },
  { id: 'upcoming', label: 'À venir' },
  { id: 'all', label: 'Toutes les tâches' },
  { id: 'done', label: 'Terminées' },
];

const PRIORITY_RANK = (t: Task) => -t.priority;

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const byOrder = (a: Task, b: Task) => a.order - b.order;
  const sorted = [...tasks];
  switch (mode) {
    case 'manual':
      return sorted.sort(byOrder);
    case 'priority':
      return sorted.sort((a, b) => PRIORITY_RANK(a) - PRIORITY_RANK(b) || byOrder(a, b));
    case 'time':
      return sorted.sort(
        (a, b) =>
          (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
          (a.time ?? '99').localeCompare(b.time ?? '99') ||
          byOrder(a, b),
      );
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
  }
}

export function doneDay(t: Task): DayKey {
  return toKey(new Date(t.doneAt ?? t.updatedAt));
}

export function isOverdue(t: Task, today = todayKey()): boolean {
  return !t.done && t.date !== null && t.date < today;
}

export function buildView(view: ViewId, data: AppData, sort: SortMode, today = todayKey()): ViewModel {
  const open = data.tasks.filter((t) => !t.done);
  const s = (tasks: Task[]) => sortTasks(tasks, sort);

  if (view === 'today') {
    const overdue = sortTasks(
      open.filter((t) => t.date && t.date < today),
      sort === 'manual' ? 'time' : sort,
    );
    const todays = s(open.filter((t) => t.date === today));
    const doneToday = data.tasks
      .filter((t) => t.done && doneDay(t) === today)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return {
      title: 'Aujourd’hui',
      subtitle: formatLongDay(today),
      defaults: { date: today },
      sortable: sort === 'manual',
      sections: [
        { key: 'overdue', title: 'En retard', tasks: overdue, tone: 'danger', dropDate: undefined },
        {
          key: 'today',
          title: overdue.length ? 'Aujourd’hui' : null,
          tasks: todays,
          dropDate: today,
          keepEmpty: true,
          defaults: { date: today },
        },
        { key: 'done', title: 'Terminées aujourd’hui', tasks: doneToday, done: true, collapsible: true },
      ],
    };
  }

  if (view === 'upcoming') {
    const sections: Section[] = [];
    const overdue = sortTasks(
      open.filter((t) => t.date && t.date < today),
      'time',
    );
    if (overdue.length) sections.push({ key: 'overdue', title: 'En retard', tasks: overdue, tone: 'danger' });
    for (let i = 0; i < 8; i++) {
      const day = addDays(today, i);
      sections.push({
        key: `day:${day}`,
        title: formatDay(day, today),
        subtitle: i > 1 ? undefined : formatLongDay(day),
        tasks: s(open.filter((t) => t.date === day)),
        dropDate: day,
        keepEmpty: true,
        defaults: { date: day },
      });
    }
    const horizon = addDays(today, 7);
    sections.push({
      key: 'later',
      title: 'Plus tard',
      tasks: sortTasks(
        open.filter((t) => t.date && t.date > horizon),
        sort === 'manual' ? 'time' : sort,
      ),
      collapsible: true,
    });
    return { title: 'À venir', defaults: { date: addDays(today, 1) }, sortable: sort === 'manual', sections };
  }

  if (view === 'all') {
    const lists = [...data.lists].sort((a, b) => a.order - b.order);
    return {
      title: 'Toutes les tâches',
      defaults: {},
      sortable: sort === 'manual',
      sections: lists.map((l) => ({
        key: `list:${l.id}`,
        title: l.name,
        tasks: s(open.filter((t) => t.listId === l.id)),
        dropList: l.id,
        defaults: { listId: l.id },
        keepEmpty: false,
        collapsible: true,
      })),
    };
  }

  if (view === 'done') {
    const done = data.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    const groups = new Map<DayKey, Task[]>();
    for (const t of done) {
      const k = doneDay(t);
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
    return {
      title: 'Terminées',
      defaults: {},
      sortable: false,
      sections: [...groups.entries()].map(([day, tasks]) => ({
        key: `done:${day}`,
        title: formatDay(day, today),
        tasks,
        done: true,
      })),
    };
  }

  const listId = view.slice(5);
  const list = data.lists.find((l) => l.id === listId) ?? data.lists.find((l) => l.id === INBOX_ID)!;
  const inList = data.tasks.filter((t) => t.listId === list.id);
  return {
    title: list.name,
    defaults: { listId: list.id },
    sortable: sort === 'manual',
    sections: [
      {
        key: 'open',
        title: null,
        tasks: s(inList.filter((t) => !t.done)),
        dropList: list.id,
        keepEmpty: true,
        defaults: { listId: list.id },
      },
      {
        key: 'done',
        title: 'Terminées',
        tasks: inList.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
        done: true,
        collapsible: true,
      },
    ],
  };
}

/** Compteurs de la barre latérale. */
export function viewCounts(data: AppData, today = todayKey()) {
  let todayCount = 0;
  let overdue = 0;
  let upcoming = 0;
  let all = 0;
  const perList = new Map<ID, number>();
  for (const t of data.tasks) {
    if (t.done) continue;
    all++;
    perList.set(t.listId, (perList.get(t.listId) ?? 0) + 1);
    if (t.date && t.date <= today) {
      todayCount++;
      if (t.date < today) overdue++;
    } else if (t.date) upcoming++;
  }
  return { today: todayCount, overdue, upcoming, all, perList };
}

/** Bilan de la journée : avancement, charge estimée restante, heure de fin probable. */
export function dayStats(data: AppData, today = todayKey()) {
  const planned = data.tasks.filter(
    (t) => t.date && t.date <= today && (!t.done || (t.doneAt && doneDay(t) === today)),
  );
  const done = planned.filter((t) => t.done).length;
  const remaining = planned.filter((t) => !t.done);
  const remainingMinutes = remaining.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
  const plannedMinutes = planned.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
  return {
    total: planned.length,
    done,
    remaining: remaining.length,
    remainingMinutes,
    plannedMinutes,
    unestimated: remaining.filter((t) => !t.estimate).length,
  };
}

/** Tâches à proposer pour remplir la journée : sans date, puis prévues demain. */
export function suggestions(data: AppData, today = todayKey()): Task[] {
  const open = data.tasks.filter((t) => !t.done);
  const undated = sortTasks(
    open.filter((t) => !t.date),
    'priority',
  );
  const tomorrow = sortTasks(
    open.filter((t) => t.date === addDays(today, 1)),
    'priority',
  );
  return [...undated, ...tomorrow].slice(0, 12);
}
