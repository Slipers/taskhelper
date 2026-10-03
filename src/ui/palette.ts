import { formatDay, todayKey } from '../core/dates';
import { normalize, parseQuickAdd } from '../core/parse';
import type { Task, ViewId } from '../core/types';
import { rescheduleOverdue } from './actions';
import { clear, h } from './dom';
import { ICONS } from './icons';
import { taskFromInput } from './quickadd';
import { createList } from './sidebar';
import { emit, openDetail, setView, store, ui } from './state';

interface Item {
  icon: string;
  label: string;
  sub?: string;
  hint?: string;
  color?: string;
  done?: boolean;
  run: () => void;
}

let root: HTMLElement | null = null;

function viewOf(t: Task): ViewId {
  const today = todayKey();
  if (t.done) return 'done';
  if (t.date && t.date <= today) return 'today';
  if (t.date) return 'upcoming';
  return `list:${t.listId}`;
}

function commands(): Item[] {
  const go = (view: ViewId) => () => setView(view);
  return [
    { icon: ICONS.plus, label: 'Nouvelle tâche', hint: 'N', run: () => emit('quickadd:focus') },
    { icon: ICONS.sun, label: 'Aller à Aujourd’hui', hint: 'Ctrl+1', run: go('today') },
    { icon: ICONS.calendar, label: 'Aller à À venir', hint: 'Ctrl+2', run: go('upcoming') },
    { icon: ICONS.stack, label: 'Aller à Toutes les tâches', hint: 'Ctrl+3', run: go('all') },
    { icon: ICONS.checkCircle, label: 'Aller à Terminées', hint: 'Ctrl+4', run: go('done') },
    ...store.sortedLists.map((l) => ({
      icon: '',
      color: l.color,
      label: `Liste : ${l.name}`,
      run: go(`list:${l.id}`),
    })),
    {
      icon: ICONS.sparkles,
      label: 'Planifier ma journée',
      run: () => {
        setView('today');
        ui.planOpen = true;
        store.emit('ui');
      },
    },
    { icon: ICONS.sun, label: 'Reporter les tâches en retard à aujourd’hui', run: rescheduleOverdue },
    { icon: ICONS.target, label: 'Mode focus', hint: 'F', run: () => emit('focus:start', store.selectedId) },
    { icon: ICONS.list, label: 'Nouvelle liste', run: () => void createList() },
    {
      icon: ICONS.moon,
      label: 'Basculer thème clair / sombre',
      hint: 'Ctrl+Maj+L',
      run: () => store.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }),
    },
    { icon: ICONS.settings, label: 'Réglages', hint: 'Ctrl+,', run: () => emit('settings:open') },
    { icon: ICONS.keyboard, label: 'Raccourcis clavier', hint: 'F1', run: () => emit('shortcuts:open') },
  ];
}

function searchTasks(q: string): Item[] {
  const nq = normalize(q);
  const scored: Array<{ t: Task; score: number }> = [];
  for (const t of store.data.tasks) {
    const title = normalize(t.title);
    let score = -1;
    if (title.startsWith(nq)) score = 3;
    else if (title.includes(nq)) score = 2;
    else if (normalize(t.notes).includes(nq) || t.subtasks.some((s) => normalize(s.title).includes(nq))) score = 1;
    if (score < 0) continue;
    if (t.done) score -= 0.5;
    scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score || b.t.updatedAt - a.t.updatedAt);
  const today = todayKey();
  return scored.slice(0, 30).map(({ t }) => {
    const list = store.list(t.listId);
    return {
      icon: '',
      color: list?.color,
      label: t.title,
      sub: [list?.name, t.date ? formatDay(t.date, today) : null, t.done ? 'terminée' : null]
        .filter(Boolean)
        .join(' · '),
      done: t.done,
      run: () => {
        setView(viewOf(t));
        openDetail(t.id);
        requestAnimationFrame(() =>
          document
            .querySelector(`.task-row[data-id="${t.id}"]`)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
        );
      },
    };
  });
}

export function openPalette() {
  if (root) return;
  const input = h('input', {
    class: 'palette-input',
    placeholder: 'Rechercher une tâche ou une commande…',
    attrs: { spellcheck: 'false' },
  });
  const results = h('div', { class: 'palette-results', attrs: { role: 'listbox' } });
  let items: Item[] = [];
  let active = 0;

  const close = () => {
    if (!root) return;
    root.remove();
    root = null;
  };

  const run = (i: number) => {
    const item = items[i];
    if (!item) return;
    close();
    item.run();
  };

  const paint = () => {
    clear(results);
    const q = input.value.trim();
    const cmds = commands().filter((c) => !q || normalize(c.label).includes(normalize(q)));
    const tasks = q ? searchTasks(q) : [];
    items = [];
    const group = (title: string, list: Item[]) => {
      if (!list.length) return;
      results.append(h('div', { class: 'palette-group', text: title }));
      for (const item of list) {
        const index = items.length;
        items.push(item);
        results.append(
          h(
            'button',
            {
              class: `palette-item${index === active ? ' active' : ''}${item.done ? ' done' : ''}`,
              on: {
                click: () => run(index),
                pointermove: () => {
                  if (active !== index) {
                    active = index;
                    highlight();
                  }
                },
              },
            },
            item.color && !item.icon
              ? h('span', { class: 'palette-dot', style: { background: item.color } })
              : h('span', { class: 'palette-icon', html: item.icon }),
            h(
              'span',
              { class: 'palette-label' },
              h('span', { text: item.label }),
              item.sub ? h('small', { text: item.sub }) : null,
            ),
            item.hint ? h('kbd', { text: item.hint }) : null,
          ),
        );
      }
    };
    group('Tâches', tasks);
    group('Commandes', q ? cmds.slice(0, 6) : cmds);
    if (q) {
      const parsed = parseQuickAdd(q, store.data.lists);
      group('Créer', [
        {
          icon: ICONS.plus,
          label: `Créer « ${parsed.title} »`,
          sub: parsed.date ? formatDay(parsed.date) + (parsed.time ? ` · ${parsed.time}` : '') : 'Sans date',
          hint: 'Ctrl+Entrée',
          run: () => {
            const t = store.addTask(taskFromInput(parsed, {}));
            setView(viewOf(t));
            openDetail(t.id);
          },
        },
      ]);
    }
    if (!items.length) results.append(h('div', { class: 'palette-empty', text: 'Aucun résultat' }));
  };

  const highlight = () => {
    results.querySelectorAll('.palette-item').forEach((el, i) => el.classList.toggle('active', i === active));
    results.querySelectorAll('.palette-item')[active]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    active = 0;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(e.ctrlKey ? items.length - 1 : active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  root = h(
    'div',
    {
      class: 'palette-backdrop',
      on: {
        pointerdown: (e) => {
          if (e.target === root) close();
        },
      },
    },
    h(
      'div',
      { class: 'palette' },
      h('div', { class: 'palette-search' }, h('span', { html: ICONS.search }), input),
      results,
    ),
  );
  document.body.append(root);
  paint();
  input.focus();
}

export function isPaletteOpen() {
  return root !== null;
}
