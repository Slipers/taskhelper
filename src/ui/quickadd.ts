import { describeRecurrence, formatDay, formatDuration, todayKey } from '../core/dates';
import { parseQuickAdd, type ParsedTask } from '../core/parse';
import type { Task } from '../core/types';
import { PRIORITY_LABELS } from './actions';
import { clear, h } from './dom';
import { ICONS } from './icons';
import { store } from './state';

/** Fusionne la saisie analysée avec les valeurs par défaut du contexte (vue, section). */
export function taskFromInput(parsed: ParsedTask, defaults: Partial<Task>): Partial<Task> & { title: string } {
  const out: Partial<Task> & { title: string } = { ...defaults, title: parsed.title };
  if (parsed.date) out.date = parsed.date;
  if (parsed.time) out.time = parsed.time;
  if (parsed.priority !== null) out.priority = parsed.priority;
  if (parsed.listId) out.listId = parsed.listId;
  if (parsed.estimate) out.estimate = parsed.estimate;
  if (parsed.recur) out.recur = parsed.recur;
  return out;
}

function previewChips(parsed: ParsedTask): HTMLElement[] {
  const chips: HTMLElement[] = [];
  const today = todayKey();
  if (parsed.date) {
    chips.push(
      h('span', {
        class: 'qa-chip',
        html: `${ICONS.calendar}<span>${formatDay(parsed.date, today)}${parsed.time ? ` · ${parsed.time}` : ''}</span>`,
      }),
    );
  }
  if (parsed.recur)
    chips.push(
      h('span', {
        class: 'qa-chip',
        html: `${ICONS.repeat}<span>${describeRecurrence(parsed.recur, parsed.date)}</span>`,
      }),
    );
  if (parsed.priority) {
    chips.push(
      h('span', {
        class: `qa-chip prio-text-${parsed.priority}`,
        html: `${ICONS.flag}<span>${PRIORITY_LABELS[parsed.priority]}</span>`,
      }),
    );
  }
  if (parsed.estimate)
    chips.push(
      h('span', { class: 'qa-chip', html: `${ICONS.hourglass}<span>${formatDuration(parsed.estimate)}</span>` }),
    );
  if (parsed.listId) {
    const l = store.list(parsed.listId);
    if (l)
      chips.push(
        h(
          'span',
          { class: 'qa-chip' },
          h('i', { class: 'qa-dot', style: { background: l.color } }),
          h('span', { text: l.name }),
        ),
      );
  }
  return chips;
}

/**
 * Champ d'ajout rapide. L'aperçu sous le champ montre en direct ce que la
 * saisie naturelle a compris, pour qu'on n'ait jamais de surprise.
 */
export function createQuickAdd(options: {
  placeholder: string;
  defaults: () => Partial<Task>;
  onAdd: (task: Task, openAfter: boolean) => void;
  onEscape?: () => void;
  onArrowDown?: () => void;
  compact?: boolean;
}) {
  const input = h('input', {
    class: 'qa-input',
    placeholder: options.placeholder,
    attrs: { 'aria-label': 'Nouvelle tâche', spellcheck: 'false' },
  });
  const preview = h('div', { class: 'qa-preview' });
  const hint = h('div', {
    class: 'qa-hint',
    html: 'Astuce : <b>demain 14h</b> · <b>!!</b> priorité · <b>#liste</b> · <b>~30m</b> durée · <b>tous les lundis</b>',
  });
  const root = h(
    'div',
    { class: `quick-add${options.compact ? ' compact' : ''}` },
    h('span', { class: 'qa-plus', html: ICONS.plus }),
    h('div', { class: 'qa-field' }, input, preview, options.compact ? null : hint),
  );

  const update = () => {
    clear(preview);
    const value = input.value.trim();
    root.classList.toggle('has-text', value.length > 0);
    if (!value) return;
    const chips = previewChips(parseQuickAdd(value, store.data.lists));
    preview.append(...chips);
    root.classList.toggle('has-preview', chips.length > 0);
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', () => root.classList.add('focused'));
  input.addEventListener('blur', () => root.classList.remove('focused'));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const parsed = parseQuickAdd(value, store.data.lists);
      const task = store.addTask(taskFromInput(parsed, options.defaults()));
      input.value = '';
      update();
      options.onAdd(task, e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (input.value) {
        input.value = '';
        update();
      } else {
        input.blur();
        options.onEscape?.();
      }
    } else if (e.key === 'ArrowDown' && !input.value) {
      e.preventDefault();
      input.blur();
      options.onArrowDown?.();
    }
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.target !== input) {
      e.preventDefault();
      input.focus();
    }
  });

  return { root, input, focus: () => input.focus() };
}
