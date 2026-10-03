import { describeRecurrence, formatDay, formatDuration, nowTime, todayKey } from '../core/dates';
import type { Task, ViewId } from '../core/types';
import { pickDate, taskMenu, toggleComplete } from './actions';
import { h } from './dom';
import { ICONS } from './icons';
import { store } from './state';

export function checkButton(done: boolean, priority: number, onToggle: () => void, label = 'Terminer') {
  return h('button', {
    class: `check prio-${priority}${done ? ' checked' : ''}`,
    title: done ? 'Marquer à faire' : label,
    html: ICONS.check,
    attrs: { 'aria-label': done ? 'Marquer à faire' : label, role: 'checkbox', 'aria-checked': String(done) },
    on: {
      click: (e) => {
        e.stopPropagation();
        onToggle();
      },
      pointerdown: (e) => e.stopPropagation(),
    },
  });
}

/** Petits indicateurs sous le titre : jour, heure, répétition, sous-tâches, notes, durée, liste. */
function metaChips(task: Task, view: ViewId): HTMLElement[] {
  const today = todayKey();
  const chips: HTMLElement[] = [];
  const showDate =
    task.date &&
    !(view === 'today' && task.date === today) &&
    !(view === 'upcoming' && !task.done && task.date >= today);
  if (showDate || task.time) {
    const late =
      !task.done &&
      task.date !== null &&
      (task.date < today || (task.date === today && task.time !== null && task.time < nowTime()));
    const parts: string[] = [];
    if (showDate) parts.push(formatDay(task.date!, today));
    if (task.time) parts.push(task.time);
    chips.push(
      h('button', {
        class: `chip-meta chip-date${late ? ' late' : ''}`,
        html: `${ICONS.calendar}<span>${parts.join(' · ')}</span>`,
        title: 'Changer la date',
        on: {
          click: (e) => {
            e.stopPropagation();
            pickDate(task.id, e.currentTarget as HTMLElement);
          },
          pointerdown: (e) => e.stopPropagation(),
        },
      }),
    );
  }
  if (task.recur)
    chips.push(h('span', { class: 'chip-meta', html: ICONS.repeat, title: describeRecurrence(task.recur, task.date) }));
  if (task.subtasks.length) {
    const done = task.subtasks.filter((s) => s.done).length;
    chips.push(
      h('span', {
        class: `chip-meta${done === task.subtasks.length ? ' complete' : ''}`,
        html: `${ICONS.subtasks}<span>${done}/${task.subtasks.length}</span>`,
        title: 'Sous-tâches',
      }),
    );
  }
  if (task.notes.trim()) chips.push(h('span', { class: 'chip-meta', html: ICONS.note, title: 'Contient des notes' }));
  if (task.estimate)
    chips.push(
      h('span', {
        class: 'chip-meta',
        html: `${ICONS.hourglass}<span>${formatDuration(task.estimate)}</span>`,
        title: 'Durée estimée',
      }),
    );
  if (!view.startsWith('list:') && view !== 'all') {
    const list = store.list(task.listId);
    if (list && store.data.lists.length > 1) {
      chips.push(
        h(
          'span',
          { class: 'chip-meta chip-list' },
          h('i', { style: { background: list.color } }),
          h('span', { text: list.name }),
        ),
      );
    }
  }
  return chips;
}

export function renderTaskRow(task: Task, view: ViewId, selected: boolean): HTMLElement {
  const chips = metaChips(task, view);
  const row = h(
    'div',
    {
      class: `task-row${task.done ? ' done' : ''}${selected ? ' selected' : ''}`,
      dataset: { id: task.id },
      attrs: { tabindex: '-1', role: 'listitem' },
    },
    checkButton(task.done, task.priority, () => toggleComplete(task.id)),
    h(
      'div',
      { class: 'task-main' },
      h('div', { class: 'task-title', text: task.title || 'Sans titre' }),
      chips.length ? h('div', { class: 'task-meta' }, ...chips) : null,
    ),
    h(
      'div',
      { class: 'task-actions' },
      task.done
        ? null
        : h('button', {
            class: 'icon-btn small',
            html: ICONS.calendar,
            title: 'Planifier',
            on: {
              click: (e) => {
                e.stopPropagation();
                pickDate(task.id, e.currentTarget as HTMLElement);
              },
              pointerdown: (e) => e.stopPropagation(),
            },
          }),
      h('button', {
        class: 'icon-btn small',
        html: ICONS.more,
        title: 'Plus d’actions',
        on: {
          click: (e) => {
            e.stopPropagation();
            taskMenu(task.id, e.currentTarget as HTMLElement);
          },
          pointerdown: (e) => e.stopPropagation(),
        },
      }),
    ),
  );
  if (task.priority === 3 && !task.done) row.classList.add('high');
  return row;
}
