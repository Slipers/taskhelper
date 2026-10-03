import {
  addDays,
  formatDay,
  formatDuration,
  minutesToTime,
  nextWeekday,
  nowTime,
  timeToMinutes,
  todayKey,
} from '../core/dates';
import type { ID, Priority, SortMode, Task } from '../core/types';
import { INBOX_ID } from '../core/types';
import { buildView, dayStats, suggestions, type Section, type ViewModel } from '../core/views';
import { deleteList, deleteWithUndo, rescheduleOverdue, schedule, taskMenu, toggleComplete } from './actions';
import { clear, flip, h, iconButton, isTyping } from './dom';
import { ICONS } from './icons';
import { openMenu, type MenuEntry } from './menu';
import { confirmDialog, promptDialog, toast } from './modal';
import { createQuickAdd } from './quickadd';
import { closeDetail, currentView, emit, on, openDetail, setView, store, ui } from './state';
import { renderTaskRow } from './taskrow';
import { LIST_COLORS } from '../core/types';

const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Ordre manuel',
  priority: 'Priorité',
  time: 'Date et heure',
  title: 'Titre (A → Z)',
};

let scrollEl: HTMLElement;
let headEl: HTMLElement;
let planEl: HTMLElement;
let sectionsEl: HTMLElement;
let topActions: HTMLElement;
let quick: ReturnType<typeof createQuickAdd>;
let model: ViewModel;
let renaming: ID | null = null;
let renderPending = false;

function sortMode(): SortMode {
  return store.settings.sort[currentView()] ?? 'manual';
}

function collapsedKey(section: Section) {
  return `${currentView()}:${section.key}`;
}

function isCollapsed(section: Section) {
  const v = store.settings.collapsed[collapsedKey(section)];
  if (v !== undefined) return v;
  // Par défaut, l'historique d'une liste reste replié ; celui du jour reste visible pour l'élan.
  return section.done === true && currentView() !== 'today';
}

/* ---------------------------------------------------------------- en-tête */

function progressRing(done: number, total: number) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  return h('div', {
    class: `ring${total && done === total ? ' full' : ''}`,
    html: `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="${r}" class="ring-bg"/><circle cx="22" cy="22" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - ratio)}"/></svg><span>${total ? Math.round(ratio * 100) : 0}%</span>`,
  });
}

function renderHead() {
  clear(headEl);
  const view = currentView();
  const list = view.startsWith('list:') ? store.list(view.slice(5)) : undefined;
  const titleEl = h(
    'h1',
    { class: 'view-title' },
    list ? h('i', { class: 'view-dot', style: { background: list.color } }) : null,
    h('span', { text: model.title }),
  );
  headEl.append(
    h(
      'div',
      { class: 'view-title-row' },
      titleEl,
      model.subtitle ? h('p', { class: 'view-sub', text: model.subtitle }) : null,
    ),
  );

  if (view !== 'today') return;

  const s = dayStats(store.data);
  const cap = store.settings.dayCapacity * 60;
  const lines: HTMLElement[] = [];
  if (s.total === 0) {
    lines.push(h('strong', { text: 'Journée libre' }), h('span', { text: 'Ajoutez ce qui compte aujourd’hui.' }));
  } else if (s.remaining === 0) {
    lines.push(
      h('strong', { text: 'Tout est fait 🎉' }),
      h('span', { text: `${s.done} tâche${s.done > 1 ? 's' : ''} bouclée${s.done > 1 ? 's' : ''} aujourd’hui.` }),
    );
  } else {
    lines.push(h('strong', { text: `${s.done} sur ${s.total} terminée${s.done > 1 ? 's' : ''}` }));
    if (s.remainingMinutes > 0) {
      const end = minutesToTime(timeToMinutes(nowTime()) + s.remainingMinutes);
      const crossesMidnight = timeToMinutes(nowTime()) + s.remainingMinutes >= 24 * 60;
      lines.push(
        h('span', {
          text: `≈ ${formatDuration(s.remainingMinutes)} restantes${crossesMidnight ? '' : ` · fin vers ${end}`}${
            s.unestimated ? ` · ${s.unestimated} sans durée` : ''
          }`,
        }),
      );
    } else {
      lines.push(
        h('span', {
          text: `${s.remaining} restante${s.remaining > 1 ? 's' : ''} · ajoutez des durées (~30m) pour estimer la fin`,
        }),
      );
    }
  }

  const load = s.plannedMinutes / cap;
  const gauge = h(
    'div',
    {
      class: `load${load > 1 ? ' over' : load > 0.85 ? ' warn' : ''}`,
      title: `Charge planifiée : ${formatDuration(s.plannedMinutes)} sur ${store.settings.dayCapacity} h disponibles`,
    },
    h(
      'div',
      { class: 'load-bar' },
      h('div', { class: 'load-fill', style: { width: `${Math.min(100, load * 100)}%` } }),
    ),
    h('span', {
      class: 'load-label',
      text: s.plannedMinutes
        ? `${formatDuration(s.plannedMinutes)} / ${store.settings.dayCapacity} h`
        : `0 / ${store.settings.dayCapacity} h`,
    }),
  );

  headEl.append(
    h(
      'div',
      { class: 'day-card' },
      progressRing(s.done, s.total),
      h('div', { class: 'day-card-text' }, ...lines),
      gauge,
      h('button', {
        class: `btn btn-soft plan-btn${ui.planOpen ? ' active' : ''}`,
        html: `${ICONS.sparkles}<span>Planifier ma journée</span>`,
        on: {
          click: () => {
            ui.planOpen = !ui.planOpen;
            render();
          },
        },
      }),
    ),
  );
}

/* ------------------------------------------------- planifier ma journée */

function renderPlan() {
  clear(planEl);
  const view = currentView();
  const today = todayKey();
  const items = view === 'today' ? suggestions(store.data, today) : [];
  const empty = model.sections.every((s) => s.done || !s.tasks.length);
  const show = view === 'today' && (ui.planOpen || (empty && items.length > 0));
  planEl.hidden = !show;
  if (!show) return;

  const rows = items.map((t) => {
    const list = store.list(t.listId);
    return h(
      'div',
      { class: 'plan-row', dataset: { id: t.id } },
      h('span', { class: 'plan-dot', style: { background: list?.color ?? 'var(--muted)' } }),
      h('span', { class: 'plan-title', text: t.title }),
      h('span', { class: 'plan-when', text: t.date ? formatDay(t.date, today) : 'Sans date' }),
      h('button', {
        class: 'btn btn-soft small',
        html: `${ICONS.plus}<span>Aujourd’hui</span>`,
        on: { click: () => schedule(t.id, today) },
      }),
    );
  });

  planEl.append(
    h(
      'div',
      { class: 'plan-head' },
      h('strong', { html: `${ICONS.sparkles}<span>Planifier ma journée</span>` }),
      h('span', {
        class: 'plan-sub',
        text: items.length
          ? 'Tâches sans date ou prévues demain, les plus prioritaires d’abord.'
          : 'Rien en attente : tout est déjà planifié.',
      }),
      ui.planOpen
        ? iconButton(
            ICONS.close,
            'Fermer',
            () => {
              ui.planOpen = false;
              render();
            },
            'small',
          )
        : null,
    ),
    ...rows,
  );
}

/* --------------------------------------------------------------- sections */

function sectionMenu(section: Section, anchor: HTMLElement) {
  const entries: MenuEntry[] = [];
  if (section.key === 'overdue') {
    entries.push({ label: 'Tout reporter à aujourd’hui', icon: ICONS.sun, run: rescheduleOverdue });
    entries.push({
      label: 'Tout reporter à demain',
      icon: ICONS.sunrise,
      run: () =>
        store.updateMany(
          section.tasks.map((t) => t.id),
          { date: addDays(todayKey(), 1) },
        ),
    });
  }
  if (section.done && section.tasks.length) {
    entries.push({
      label: 'Supprimer ces tâches terminées',
      icon: ICONS.trash,
      danger: true,
      run: () => deleteWithUndo(section.tasks.map((t) => t.id)),
    });
  }
  if (entries.length) openMenu(anchor, entries);
}

function renderSection(section: Section): HTMLElement | null {
  if (!section.tasks.length && !section.keepEmpty) return null;
  const collapsed = section.collapsible && isCollapsed(section);
  const droppable = !section.done && (section.dropDate !== undefined || section.dropList !== undefined);
  const el = h('section', {
    class: `section${section.tone ? ` tone-${section.tone}` : ''}${collapsed ? ' collapsed' : ''}${section.done ? ' section-done' : ''}`,
    dataset: { key: section.key, droppable: droppable ? '1' : '0' },
  });
  if (section.dropDate !== undefined) el.dataset.dropDate = section.dropDate ?? '';
  if (section.dropList) el.dataset.dropList = section.dropList;

  if (section.title) {
    const toggle = () => {
      store.setSettings({ collapsed: { ...store.settings.collapsed, [collapsedKey(section)]: !collapsed } });
    };
    const head = h(
      'div',
      { class: 'section-head' },
      h(
        'button',
        {
          class: 'section-toggle',
          on: { click: section.collapsible ? toggle : () => {} },
          disabled: !section.collapsible,
        },
        section.collapsible ? h('span', { class: 'section-chevron', html: ICONS.chevronDown }) : null,
        h('span', { class: 'section-name', text: section.title }),
        section.subtitle ? h('span', { class: 'section-sub', text: section.subtitle }) : null,
        h('span', { class: 'section-count', text: section.tasks.length ? String(section.tasks.length) : '' }),
      ),
    );
    if (section.key === 'overdue') {
      head.append(
        h('button', { class: 'btn btn-soft small', text: 'Reporter à aujourd’hui', on: { click: rescheduleOverdue } }),
      );
    }
    if (section.key === 'overdue' || (section.done && section.tasks.length)) {
      head.append(
        iconButton(ICONS.more, 'Actions', () => sectionMenu(section, head.lastElementChild as HTMLElement), 'small'),
      );
    }
    el.append(head);
  }

  if (collapsed) return el;

  const body = h('div', { class: 'section-body', attrs: { role: 'list' } });
  for (const t of section.tasks) {
    const row = renderTaskRow(t, currentView(), store.selectedId === t.id);
    if (ui.justAdded === t.id) row.classList.add('row-enter');
    body.append(row);
  }
  el.append(body);

  // Ajout direct dans un jour ou une liste précise (vues « À venir » et « Toutes »).
  if (section.defaults && (currentView() === 'upcoming' || currentView() === 'all')) {
    el.append(sectionAdder(section));
  }
  return el;
}

function sectionAdder(section: Section) {
  const wrap = h('div', { class: 'section-adder' });
  const btn = h('button', {
    class: 'adder-btn',
    html: `${ICONS.plus}<span>Ajouter une tâche</span>`,
    on: {
      click: () => {
        const qa = createQuickAdd({
          placeholder: 'Nouvelle tâche…',
          compact: true,
          defaults: () => section.defaults ?? {},
          onAdd: (task) => {
            ui.justAdded = task.id;
          },
          onEscape: () => render(),
        });
        qa.input.addEventListener('blur', () => {
          if (!qa.input.value) setTimeout(render, 120);
        });
        wrap.replaceChildren(qa.root);
        qa.focus();
      },
    },
  });
  wrap.append(btn);
  return wrap;
}

function emptyState(): HTMLElement | null {
  const hasOpen = model.sections.some((s) => !s.done && s.tasks.length);
  const hasAny = model.sections.some((s) => s.tasks.length);
  const view = currentView();
  if (hasOpen || (view !== 'today' && hasAny) || view === 'upcoming') return null;
  const [icon, title, text] =
    view === 'today'
      ? hasAny
        ? [
            ICONS.checkCircle,
            'Journée bouclée',
            'Tout ce qui était prévu est fait. Profitez-en, ou piochez dans « Planifier ma journée ».',
          ]
        : [
            ICONS.sun,
            'Rien de prévu aujourd’hui',
            'Tapez une tâche ci-dessus, ou planifiez votre journée à partir de vos tâches en attente.',
          ]
      : view === 'done'
        ? [ICONS.checkCircle, 'Aucune tâche terminée', 'Les tâches cochées apparaîtront ici.']
        : [ICONS.inbox, 'Aucune tâche', 'Ajoutez la première ci-dessus. Appuyez sur N n’importe où pour revenir ici.'];
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon', html: icon }),
    h('strong', { text: title }),
    h('p', { text: text }),
  );
}

/* ---------------------------------------------------------------- rendu */

export function render() {
  if (renaming) {
    renderPending = true;
    return;
  }
  renderPending = false;
  const view = currentView();
  model = buildView(view, store.data, sortMode());
  renderTopActions();
  renderHead();
  quick.input.placeholder =
    view === 'today'
      ? 'Ajouter une tâche pour aujourd’hui…'
      : view === 'upcoming'
        ? 'Ajouter une tâche (demain par défaut)…'
        : view === 'done'
          ? 'Ajouter une tâche…'
          : `Ajouter une tâche${view.startsWith('list:') ? ` à « ${model.title} »` : ''}…`;
  flip(sectionsEl, '.task-row', () => {
    clear(sectionsEl);
    for (const section of model.sections) {
      const el = renderSection(section);
      if (el) sectionsEl.append(el);
    }
    const empty = emptyState();
    if (empty) sectionsEl.append(empty);
  });
  renderPlan();
  ui.justAdded = null;
}

/** L'heure de fin estimée suit l'horloge : seul l'en-tête change. */
export function refreshHead() {
  if (!renaming) renderHead();
}

/** Sélection seule : pas besoin de tout reconstruire. */
export function refreshSelection() {
  for (const row of sectionsEl.querySelectorAll<HTMLElement>('.task-row')) {
    row.classList.toggle('selected', row.dataset.id === store.selectedId);
  }
}

function renderTopActions() {
  clear(topActions);
  const view = currentView();
  const listId = view.startsWith('list:') ? view.slice(5) : null;
  topActions.append(
    iconButton(ICONS.search, 'Rechercher (Ctrl+K)', () => emit('palette:open')),
    iconButton(ICONS.target, 'Mode focus (F)', () => emit('focus:start', store.selectedId)),
  );
  if (view !== 'done') {
    topActions.append(
      h('button', {
        class: 'btn btn-ghost small sort-btn',
        html: `${ICONS.list}<span>${SORT_LABELS[sortMode()]}</span>`,
        title: 'Trier',
        on: {
          click: (e) =>
            openMenu(
              e.currentTarget as HTMLElement,
              (Object.keys(SORT_LABELS) as SortMode[]).map((mode) => ({
                label: SORT_LABELS[mode],
                checked: sortMode() === mode,
                run: () => store.setSettings({ sort: { ...store.settings.sort, [view]: mode } }),
              })),
            ),
        },
      }),
    );
  }
  if (listId) {
    topActions.append(
      iconButton(ICONS.more, 'Options de la liste', () => {
        const list = store.list(listId);
        if (!list) return;
        const btn = topActions.lastElementChild as HTMLElement;
        openMenu(btn, [
          {
            label: 'Renommer la liste',
            icon: ICONS.edit,
            run: async () => {
              const name = await promptDialog('Renommer la liste', list.name, 'Renommer');
              if (name) store.updateList(listId, { name });
            },
          },
          {
            label: 'Couleur',
            icon: ICONS.sparkles,
            submenu: LIST_COLORS.map((c) => ({
              label: c === list.color ? 'Actuelle' : ' ',
              color: c,
              checked: c === list.color,
              run: () => store.updateList(listId, { color: c }),
            })),
          },
          {
            label: 'Supprimer les tâches terminées',
            icon: ICONS.checkCircle,
            run: async () => {
              const ids = store.data.tasks.filter((t) => t.listId === listId && t.done).map((t) => t.id);
              if (!ids.length) return toast('Aucune tâche terminée dans cette liste');
              if (
                await confirmDialog(
                  'Nettoyer la liste',
                  `Supprimer ${ids.length} tâche${ids.length > 1 ? 's' : ''} terminée${ids.length > 1 ? 's' : ''} ?`,
                  'Supprimer',
                )
              ) {
                deleteWithUndo(ids);
              }
            },
          },
          ...(listId !== INBOX_ID
            ? ([
                { separator: true },
                { label: 'Supprimer la liste', icon: ICONS.trash, danger: true, run: () => void deleteList(listId) },
              ] as MenuEntry[])
            : []),
        ]);
      }),
    );
  }
}

/* ------------------------------------------------------------- renommer */

function startRename(id: ID) {
  const row = sectionsEl.querySelector<HTMLElement>(`.task-row[data-id="${id}"]`);
  const task = store.task(id);
  const titleEl = row?.querySelector<HTMLElement>('.task-title');
  if (!row || !task || !titleEl) return;
  renaming = id;
  const input = h('input', { class: 'rename-input', value: task.title });
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    renaming = null;
    const value = input.value.trim();
    if (commit && value && value !== task.title) store.updateTask(id, { title: value });
    else render();
    if (renderPending) render();
    sectionsEl.querySelector<HTMLElement>(`.task-row[data-id="${id}"]`)?.focus({ preventScroll: true });
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/* -------------------------------------------------------------- clavier */

function rows(): HTMLElement[] {
  return Array.from(sectionsEl.querySelectorAll<HTMLElement>('.task-row'));
}

export function selectRelative(delta: number) {
  const all = rows();
  if (!all.length) return;
  const i = all.findIndex((r) => r.dataset.id === store.selectedId);
  const next = i < 0 ? (delta > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, i + delta));
  const row = all[next]!;
  store.select(row.dataset.id!);
  row.scrollIntoView({ block: 'nearest' });
  row.focus({ preventScroll: true });
}

function moveSelected(delta: number) {
  const id = store.selectedId;
  if (!id || !model.sortable) {
    if (!model.sortable) toast('Passez en ordre manuel pour réordonner');
    return;
  }
  const row = sectionsEl.querySelector<HTMLElement>(`.task-row[data-id="${id}"]`);
  const siblings = row ? (Array.from(row.parentElement!.children) as HTMLElement[]) : [];
  const i = row ? siblings.indexOf(row) : -1;
  const j = i + delta;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const others = siblings.filter((r) => r !== row);
  const before = others[j - 1]?.dataset.id ?? null;
  const after = others[j]?.dataset.id ?? null;
  store.reorder(id, before, after);
}

/** Raccourcis à une touche sur la tâche sélectionnée. Renvoie vrai si la touche a été consommée. */
export function handleListKey(e: KeyboardEvent): boolean {
  if (isTyping(e.target)) return false;
  const id = store.selectedId;
  const task = store.task(id);
  const key = e.key;
  const mod = e.ctrlKey || e.metaKey;

  if ((key === 'ArrowDown' || key === 'j') && !mod) {
    if (e.altKey) moveSelected(1);
    else selectRelative(1);
    return true;
  }
  if ((key === 'ArrowUp' || key === 'k') && !mod) {
    if (e.altKey) moveSelected(-1);
    else selectRelative(-1);
    return true;
  }
  if (!task) return false;
  const today = todayKey();

  if (mod && key.toLowerCase() === 'd') {
    const copy = store.duplicateTask(task.id);
    if (copy) store.select(copy.id);
    return true;
  }
  if (mod || e.altKey) return false;

  switch (key) {
    case 'Enter':
      openDetail(task.id);
      return true;
    case 'F2':
      startRename(task.id);
      return true;
    case ' ':
    case 'x':
      toggleComplete(task.id);
      return true;
    case 'Delete':
    case 'Backspace': {
      const all = rows();
      const i = all.findIndex((r) => r.dataset.id === task.id);
      const neighbour = all[i + 1] ?? all[i - 1];
      deleteWithUndo([task.id]);
      if (neighbour?.dataset.id) store.select(neighbour.dataset.id);
      return true;
    }
    case 't':
      schedule(task.id, today);
      return true;
    case 'd':
      schedule(task.id, addDays(today, 1));
      return true;
    case 's':
      schedule(task.id, nextWeekday(today, 0));
      return true;
    case 'u':
      schedule(task.id, null);
      return true;
    case '1':
    case '2':
    case '3':
      store.updateTask(task.id, { priority: (4 - Number(key)) as Priority });
      return true;
    case '0':
      store.updateTask(task.id, { priority: 0 });
      return true;
    case 'f':
      emit('focus:start', task.id);
      return true;
    case 'ContextMenu': {
      const row = sectionsEl.querySelector<HTMLElement>(`.task-row[data-id="${task.id}"]`);
      if (row) taskMenu(task.id, (row.querySelector('.task-actions') as HTMLElement) ?? row);
      return true;
    }
  }
  return false;
}

/* ---------------------------------------------------------- glisser-déposer */

interface DragState {
  id: ID;
  row: HTMLElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  ghost: HTMLElement | null;
  originSection: HTMLElement | null;
  navTarget: HTMLElement | null;
  pointerY: number;
  raf: number;
}

let drag: DragState | null = null;
let suppressClick = false;

function setupDrag() {
  sectionsEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea')) return;
    const row = target.closest<HTMLElement>('.task-row');
    if (!row || row.classList.contains('done')) return;
    const r = row.getBoundingClientRect();
    drag = {
      id: row.dataset.id!,
      row,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      ghost: null,
      originSection: row.closest('.section'),
      navTarget: null,
      pointerY: e.clientY,
      raf: 0,
    };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
      startDrag();
    }
    moveDrag(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.ghost) endDrag(true);
    drag = null;
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && drag?.ghost) {
        e.stopPropagation();
        endDrag(false);
        drag = null;
      }
    },
    true,
  );

  // Un glisser se termine par un clic : il ne doit pas ouvrir le détail.
  sectionsEl.addEventListener(
    'click',
    (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
      }
    },
    true,
  );
}

function startDrag() {
  const d = drag!;
  const r = d.row.getBoundingClientRect();
  const ghost = d.row.cloneNode(true) as HTMLElement;
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('selected');
  ghost.style.width = `${r.width}px`;
  document.body.append(ghost);
  d.ghost = ghost;
  d.row.classList.add('drag-source');
  document.body.classList.add('dragging');
  const tick = () => {
    if (!drag?.ghost) return;
    const s = scrollEl.getBoundingClientRect();
    const edge = 56;
    if (drag.pointerY < s.top + edge) scrollEl.scrollTop -= Math.ceil((s.top + edge - drag.pointerY) / 5);
    else if (drag.pointerY > s.bottom - edge) scrollEl.scrollTop += Math.ceil((drag.pointerY - (s.bottom - edge)) / 5);
    drag.raf = requestAnimationFrame(tick);
  };
  d.raf = requestAnimationFrame(tick);
}

function moveDrag(x: number, y: number) {
  const d = drag!;
  d.pointerY = y;
  d.ghost!.style.transform = `translate(${x - d.offsetX}px, ${y - d.offsetY}px) rotate(-1deg)`;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;

  const nav = el?.closest<HTMLElement>('[data-drop-view]') ?? null;
  if (nav !== d.navTarget) {
    d.navTarget?.classList.remove('drop-hover');
    nav?.classList.add('drop-hover');
    d.navTarget = nav;
  }
  if (nav) {
    d.row.classList.add('drag-away');
    return;
  }
  d.row.classList.remove('drag-away');

  const section = el?.closest<HTMLElement>('.section');
  if (!section || section.dataset.droppable !== '1' || section.classList.contains('collapsed')) return;
  const body = section.querySelector<HTMLElement>('.section-body');
  if (!body) return;

  const overRow = el?.closest<HTMLElement>('.task-row');
  if (overRow && overRow !== d.row && body.contains(overRow)) {
    // Un ordre manuel n'a pas de sens dans une vue triée : on change seulement de section.
    if (!model.sortable && d.row.parentElement === body) return;
    const r = overRow.getBoundingClientRect();
    const before = y < r.top + r.height / 2;
    const ref = before ? overRow : overRow.nextElementSibling;
    if (ref === d.row || (before ? overRow.previousElementSibling === d.row : overRow.nextElementSibling === d.row))
      return;
    flip(sectionsEl, '.task-row:not(.drag-source)', () => body.insertBefore(d.row, ref), 160);
  } else if (d.row.parentElement !== body) {
    flip(sectionsEl, '.task-row:not(.drag-source)', () => body.append(d.row), 160);
  }
}

function endDrag(commit: boolean) {
  const d = drag!;
  cancelAnimationFrame(d.raf);
  d.ghost?.remove();
  d.row.classList.remove('drag-source', 'drag-away');
  d.navTarget?.classList.remove('drop-hover');
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (!commit) {
    render();
    return;
  }

  const id = d.id;
  if (d.navTarget) {
    dropOnView(id, d.navTarget.dataset.dropView!);
    return;
  }

  const section = d.row.closest<HTMLElement>('.section');
  if (!section) {
    render();
    return;
  }
  const patch: Partial<Task> = {};
  if (section.dataset.dropDate !== undefined && section !== d.originSection)
    patch.date = section.dataset.dropDate || null;
  if (section.dataset.dropList && section !== d.originSection) patch.listId = section.dataset.dropList;
  if (model.sortable) {
    const prev = (d.row.previousElementSibling as HTMLElement | null)?.dataset.id ?? null;
    const next = (d.row.nextElementSibling as HTMLElement | null)?.dataset.id ?? null;
    store.reorder(id, prev, next, patch);
  } else if (Object.keys(patch).length) {
    store.updateTask(id, patch);
  } else {
    render();
  }
}

function dropOnView(id: ID, target: string) {
  const today = todayKey();
  if (target === 'today') schedule(id, today);
  else if (target === 'upcoming') schedule(id, addDays(today, 1));
  else if (target === 'done') toggleComplete(id);
  else if (target.startsWith('list:')) {
    const list = store.list(target.slice(5));
    store.updateTask(id, { listId: target.slice(5) });
    if (list) toast(`Déplacée vers « ${list.name} »`, { label: 'Annuler', run: () => store.undo() });
    return;
  } else {
    render();
    return;
  }
  render();
}

/* --------------------------------------------------------------- montage */

export function mountTaskView(main: HTMLElement) {
  topActions = h('div', { class: 'top-actions' });
  const sidebarBtn = iconButton(
    ICONS.sidebar,
    'Barre latérale (Ctrl+B)',
    () => store.setSettings({ sidebarCollapsed: !store.settings.sidebarCollapsed }),
    'sidebar-toggle',
  );
  const top = h('header', { class: 'main-top' }, sidebarBtn, h('div', { class: 'main-top-spacer' }), topActions);

  headEl = h('div', { class: 'view-head' });
  quick = createQuickAdd({
    placeholder: 'Ajouter une tâche…',
    defaults: () => {
      const d = { ...model.defaults };
      // Dans « Terminées », une nouvelle tâche n'a pas de raison d'être déjà cochée ni datée.
      return currentView() === 'done' ? {} : d;
    },
    onAdd: (task, openAfter) => {
      ui.justAdded = task.id;
      if (openAfter) openDetail(task.id);
      const visible = buildView(currentView(), store.data, sortMode()).sections.some((s) =>
        s.tasks.some((t) => t.id === task.id),
      );
      if (!visible) {
        const where = task.date ? formatDay(task.date) : (store.list(task.listId)?.name ?? '');
        toast(`Ajoutée · ${where}`, {
          label: 'Voir',
          run: () => {
            setView(task.date ? (task.date <= todayKey() ? 'today' : 'upcoming') : `list:${task.listId}`);
            openDetail(task.id);
          },
        });
      }
    },
    onArrowDown: () => selectRelative(1),
  });
  planEl = h('div', { class: 'plan', hidden: true });
  sectionsEl = h('div', { class: 'sections' });
  scrollEl = h(
    'div',
    { class: 'main-scroll' },
    h('div', { class: 'main-inner' }, headEl, quick.root, planEl, sectionsEl),
  );
  main.append(top, scrollEl);

  sectionsEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.task-row');
    if (!row) return;
    openDetail(row.dataset.id!);
    row.focus({ preventScroll: true });
  });
  sectionsEl.addEventListener('dblclick', (e) => {
    const title = (e.target as HTMLElement).closest('.task-title');
    const row = title?.closest<HTMLElement>('.task-row');
    if (row && !row.classList.contains('done')) startRename(row.dataset.id!);
  });
  sectionsEl.addEventListener('contextmenu', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.task-row');
    if (!row) return;
    e.preventDefault();
    store.select(row.dataset.id!);
    taskMenu(row.dataset.id!, { x: e.clientX, y: e.clientY });
  });
  // Un clic dans le vide referme le détail, comme dans Google Tasks.
  scrollEl.addEventListener('click', (e) => {
    if (
      e.target === scrollEl ||
      (e.target as HTMLElement).classList.contains('main-inner') ||
      e.target === sectionsEl
    ) {
      closeDetail();
      store.select(null);
    }
  });

  on('quickadd:focus', () => {
    scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
    quick.focus();
  });
  on('rename:task', (id) => startRename(id));

  setupDrag();
  render();
}
