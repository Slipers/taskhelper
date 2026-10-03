import { describeRecurrence, formatDay, formatDuration, todayKey } from '../core/dates';
import type { ID, Priority, Task } from '../core/types';
import {
  deleteWithUndo,
  listEntries,
  pickDate,
  PRIORITY_LABELS,
  recurrenceEntries,
  taskMenu,
  toggleComplete,
} from './actions';
import { autosize, clear, h, iconButton } from './dom';
import { ICONS } from './icons';
import { openMenu } from './menu';
import { checkButton } from './taskrow';
import { closeDetail, emit, store, ui } from './state';

const ESTIMATES = [15, 30, 60, 120];
const MORE_ESTIMATES = [5, 10, 20, 45, 90, 180, 240];

let panel: HTMLElement;
let currentId: ID | null = null;

let checkSlot: HTMLElement;
let listBtn: HTMLButtonElement;
let titleEl: HTMLTextAreaElement;
let fitTitle: () => void;
let dateBtn: HTMLButtonElement;
let dateClear: HTMLButtonElement;
let prioBtns: HTMLButtonElement[];
let estimateRow: HTMLElement;
let recurBtn: HTMLButtonElement;
let subHead: HTMLElement;
let subList: HTMLElement;
let subAdd: HTMLInputElement;
let notesEl: HTMLTextAreaElement;
let fitNotes: () => void;
let footInfo: HTMLElement;
let subSignature = '';

const task = (): Task | undefined => store.task(currentId);

function propRow(icon: string, label: string, ...content: HTMLElement[]) {
  return h(
    'div',
    { class: 'prop' },
    h('span', { class: 'prop-icon', html: icon, title: label }),
    h('div', { class: 'prop-body' }, ...content),
  );
}

function build() {
  checkSlot = h('div', { class: 'detail-check' });
  listBtn = h('button', {
    class: 'chip-btn',
    on: {
      click: () => {
        const t = task();
        if (t) openMenu(listBtn, listEntries([t.id], t.listId));
      },
    },
  });

  titleEl = h('textarea', {
    class: 'detail-title',
    attrs: { rows: '1', placeholder: 'Titre de la tâche', spellcheck: 'true' },
  });
  fitTitle = autosize(titleEl);
  titleEl.addEventListener('input', () => {
    const t = task();
    if (t) store.updateTask(t.id, { title: titleEl.value.replace(/\n/g, ' ') }, 'title');
  });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      subAdd.focus();
    }
  });

  dateBtn = h('button', {
    class: 'chip-btn',
    on: {
      click: () => {
        const t = task();
        if (t) pickDate(t.id, dateBtn);
      },
    },
  });
  dateClear = iconButton(
    ICONS.close,
    'Retirer la date',
    () => {
      const t = task();
      if (t) store.updateTask(t.id, { date: null, time: null });
    },
    'small',
  );

  prioBtns = ([0, 1, 2, 3] as Priority[]).map((p) =>
    h('button', {
      class: `seg-btn prio-seg-${p}`,
      text: PRIORITY_LABELS[p],
      on: {
        click: () => {
          const t = task();
          if (t) store.updateTask(t.id, { priority: p });
        },
      },
    }),
  );

  estimateRow = h('div', { class: 'estimate-row' });

  recurBtn = h('button', {
    class: 'chip-btn',
    on: {
      click: () => {
        const t = task();
        if (t) openMenu(recurBtn, recurrenceEntries(t));
      },
    },
  });

  subHead = h('div', { class: 'detail-section-head' });
  subList = h('div', { class: 'subtasks' });
  subAdd = h('input', { class: 'subtask-add', placeholder: 'Ajouter une sous-tâche' });
  subAdd.addEventListener('keydown', (e) => {
    const t = task();
    if (!t) return;
    if (e.key === 'Enter' && subAdd.value.trim()) {
      e.preventDefault();
      // Coller plusieurs lignes crée autant de sous-tâches.
      for (const line of subAdd.value
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean))
        store.addSubtask(t.id, line);
      subAdd.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (subList.lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus();
    } else if (e.key === 'Escape') {
      subAdd.blur();
    }
  });
  subAdd.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const t = task();
    if (!t || !text.includes('\n')) return;
    e.preventDefault();
    for (const line of text
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*(?:[-*•]|\[[ x]\]|\d+[.)])\s*/i, '').trim())
      .filter(Boolean)) {
      store.addSubtask(t.id, line);
    }
  });

  notesEl = h('textarea', {
    class: 'detail-notes',
    attrs: { rows: '3', placeholder: 'Notes, liens, détails…', spellcheck: 'true' },
  });
  fitNotes = autosize(notesEl);
  notesEl.addEventListener('input', () => {
    const t = task();
    if (t) store.updateTask(t.id, { notes: notesEl.value }, 'notes');
  });

  footInfo = h('span', { class: 'detail-foot-info' });

  panel.append(
    h(
      'div',
      { class: 'detail-top' },
      checkSlot,
      listBtn,
      h('div', { class: 'spacer' }),
      iconButton(ICONS.target, 'Mode focus (F)', () => currentId && emit('focus:start', currentId), 'small'),
      iconButton(
        ICONS.more,
        'Plus d’actions',
        () => {
          const btn = panel.querySelector<HTMLElement>('.detail-top .icon-btn:nth-last-child(2)');
          if (currentId && btn) taskMenu(currentId, btn);
        },
        'small',
      ),
      iconButton(ICONS.close, 'Fermer (Échap)', () => closeDetail(), 'small'),
    ),
    h(
      'div',
      { class: 'detail-scroll' },
      titleEl,
      h(
        'div',
        { class: 'props' },
        propRow(ICONS.calendar, 'Date', dateBtn, dateClear),
        propRow(ICONS.flag, 'Priorité', h('div', { class: 'segmented' }, ...prioBtns)),
        propRow(ICONS.hourglass, 'Durée estimée', estimateRow),
        propRow(ICONS.repeat, 'Répétition', recurBtn),
      ),
      h(
        'div',
        { class: 'detail-section' },
        subHead,
        subList,
        h('div', { class: 'subtask-add-row' }, h('span', { class: 'subtask-add-icon', html: ICONS.plus }), subAdd),
      ),
      h(
        'div',
        { class: 'detail-section' },
        h('div', { class: 'detail-section-head' }, h('span', { html: ICONS.note }), h('strong', { text: 'Notes' })),
        notesEl,
      ),
    ),
    h(
      'div',
      { class: 'detail-foot' },
      footInfo,
      h('button', {
        class: 'btn btn-ghost danger small',
        html: `${ICONS.trash}<span>Supprimer</span>`,
        on: {
          click: () => {
            if (currentId) deleteWithUndo([currentId]);
          },
        },
      }),
    ),
  );
}

function renderEstimates(t: Task) {
  clear(estimateRow);
  const custom = t.estimate && !ESTIMATES.includes(t.estimate);
  for (const m of ESTIMATES) {
    estimateRow.append(
      h('button', {
        class: `chip${t.estimate === m ? ' active' : ''}`,
        text: formatDuration(m),
        on: { click: () => store.updateTask(t.id, { estimate: t.estimate === m ? null : m }) },
      }),
    );
  }
  const more = h('button', {
    class: `chip${custom ? ' active' : ''}`,
    text: custom ? formatDuration(t.estimate!) : 'Autre…',
    on: {
      click: () =>
        openMenu(more, [
          { label: 'Aucune', checked: !t.estimate, run: () => store.updateTask(t.id, { estimate: null }) },
          { separator: true },
          ...[...MORE_ESTIMATES, ...ESTIMATES]
            .sort((a, b) => a - b)
            .map((m) => ({
              label: formatDuration(m),
              checked: t.estimate === m,
              run: () => store.updateTask(t.id, { estimate: m }),
            })),
        ]),
    },
  });
  estimateRow.append(more);
}

/** Reconstruit la liste des sous-tâches en gardant le focus et le curseur là où ils étaient. */
function renderSubtasks(t: Task, force = false) {
  const signature = t.subtasks.map((s) => `${s.id}:${s.done ? 1 : 0}:${s.title}`).join('|');
  const done = t.subtasks.filter((s) => s.done).length;
  subHead.replaceChildren(
    ...[
      h('span', { html: ICONS.subtasks }),
      h('strong', { text: 'Sous-tâches' }),
      t.subtasks.length ? h('span', { class: 'sub-count', text: `${done}/${t.subtasks.length}` }) : null,
      t.subtasks.length
        ? h('div', { class: 'sub-progress' }, h('div', { style: { width: `${(done / t.subtasks.length) * 100}%` } }))
        : null,
    ].filter((x): x is HTMLElement => x !== null),
  );
  if (signature === subSignature && !force) return;
  subSignature = signature;

  const active = document.activeElement as HTMLInputElement | null;
  const focusedId = active?.closest<HTMLElement>('.subtask')?.dataset.id;
  const caret = active?.selectionStart ?? null;

  clear(subList);
  t.subtasks.forEach((s, i) => {
    const input = h('input', { class: 'subtask-input', value: s.title });
    input.addEventListener('input', () => store.updateSubtask(t.id, s.id, { title: input.value }, 'title'));
    input.addEventListener('keydown', (e) => {
      const inputs = () => Array.from(subList.querySelectorAll<HTMLInputElement>('.subtask-input'));
      if (e.key === 'Enter') {
        e.preventDefault();
        const added = store.addSubtask(t.id, '', i + 1);
        requestAnimationFrame(() =>
          subList.querySelector<HTMLInputElement>(`.subtask[data-id="${added.id}"] input`)?.focus(),
        );
      } else if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        const prev = inputs()[i - 1];
        store.removeSubtask(t.id, s.id);
        requestAnimationFrame(() => (prev ? prev.focus() : titleEl.focus()));
      } else if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        store.moveSubtask(t.id, s.id, i - 1);
      } else if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        store.moveSubtask(t.id, s.id, i + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        inputs()[i - 1]?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        (inputs()[i + 1] ?? subAdd).focus();
      } else if (e.key === 'Escape') {
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      // Une sous-tâche laissée vide disparaît d'elle-même.
      setTimeout(() => {
        const cur = store.task(t.id)?.subtasks.find((x) => x.id === s.id);
        if (cur && !cur.title.trim() && !subList.contains(document.activeElement)) store.removeSubtask(t.id, s.id);
      }, 0);
    });
    subList.append(
      h(
        'div',
        { class: `subtask${s.done ? ' done' : ''}`, dataset: { id: s.id } },
        checkButton(s.done, 0, () => store.updateSubtask(t.id, s.id, { done: !s.done })),
        input,
        iconButton(ICONS.close, 'Supprimer la sous-tâche', () => store.removeSubtask(t.id, s.id), 'small sub-del'),
      ),
    );
  });

  if (focusedId) {
    const input = subList.querySelector<HTMLInputElement>(`.subtask[data-id="${focusedId}"] input`);
    if (input) {
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    }
  }
}

function sync() {
  const t = task();
  if (!t) return;
  clear(checkSlot);
  checkSlot.append(checkButton(t.done, t.priority, () => toggleComplete(t.id)));
  panel.classList.toggle('is-done', t.done);

  const list = store.list(t.listId);
  listBtn.replaceChildren(
    h('i', { class: 'chip-dot', style: { background: list?.color ?? 'var(--muted)' } }),
    h('span', { text: list?.name ?? '' }),
  );

  if (document.activeElement !== titleEl && titleEl.value !== t.title) {
    titleEl.value = t.title;
    fitTitle();
  }

  const today = todayKey();
  const late = !t.done && t.date !== null && t.date < today;
  dateBtn.classList.toggle('late', late);
  dateBtn.classList.toggle('empty', !t.date);
  dateBtn.textContent = t.date ? `${formatDay(t.date, today)}${t.time ? ` · ${t.time}` : ''}` : 'Ajouter une date';
  dateClear.hidden = !t.date;

  prioBtns.forEach((b, p) => b.classList.toggle('active', t.priority === p));
  renderEstimates(t);

  recurBtn.textContent = t.recur ? describeRecurrence(t.recur, t.date) : 'Ne se répète pas';
  recurBtn.classList.toggle('empty', !t.recur);

  renderSubtasks(t);

  if (document.activeElement !== notesEl && notesEl.value !== t.notes) {
    notesEl.value = t.notes;
    fitNotes();
  }

  const created = new Date(t.createdAt);
  footInfo.textContent =
    t.done && t.doneAt
      ? `Terminée ${formatDay(todayKeyOf(t.doneAt), today).toLowerCase()}`
      : `Créée ${formatDay(todayKeyOf(created.getTime()), today).toLowerCase()}`;
}

function todayKeyOf(ms: number) {
  return todayKey(new Date(ms));
}

export function refreshDetail() {
  const id = ui.detailOpen ? store.selectedId : null;
  const t = store.task(id);
  const open = Boolean(t);
  panel.classList.toggle('open', open);
  document.body.classList.toggle('detail-open', open);
  if (!t) {
    currentId = null;
    return;
  }
  if (t.id !== currentId) {
    currentId = t.id;
    subSignature = '';
    titleEl.value = t.title;
    notesEl.value = t.notes;
    subAdd.value = '';
    renderSubtasks(t, true);
    requestAnimationFrame(() => {
      fitTitle();
      fitNotes();
    });
  }
  sync();
}

export function focusDetailTitle() {
  titleEl.focus();
  titleEl.setSelectionRange(titleEl.value.length, titleEl.value.length);
}

export function mountDetail(aside: HTMLElement) {
  panel = aside;
  build();
  refreshDetail();
}
