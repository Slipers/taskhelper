import type { ViewId } from '../core/types';
import { INBOX_ID, LIST_COLORS } from '../core/types';
import { viewCounts } from '../core/views';
import { deleteList } from './actions';
import { clear, h, iconButton } from './dom';
import { ICONS } from './icons';
import { openMenu } from './menu';
import { promptDialog } from './modal';
import { currentView, emit, setView, store } from './state';

const SMART: Array<{ id: ViewId; label: string; icon: string; key: string }> = [
  { id: 'today', label: 'Aujourd’hui', icon: ICONS.sun, key: '1' },
  { id: 'upcoming', label: 'À venir', icon: ICONS.calendar, key: '2' },
  { id: 'all', label: 'Toutes les tâches', icon: ICONS.stack, key: '3' },
  { id: 'done', label: 'Terminées', icon: ICONS.checkCircle, key: '4' },
];

let navEl: HTMLElement;
let listsEl: HTMLElement;

export async function createList() {
  const name = await promptDialog('Nouvelle liste', '', 'Créer', 'Travail, Courses, Projet…');
  if (!name) return;
  const list = store.addList(name);
  setView(`list:${list.id}`);
}

function listMenu(listId: string, anchor: HTMLElement | { x: number; y: number }) {
  const list = store.list(listId);
  if (!list) return;
  const sorted = store.sortedLists;
  const index = sorted.findIndex((l) => l.id === listId);
  openMenu(anchor, [
    {
      label: 'Renommer',
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
    { label: 'Monter', icon: ICONS.chevronUp, disabled: index <= 0, run: () => store.moveList(listId, index - 1) },
    {
      label: 'Descendre',
      icon: ICONS.chevronDown,
      disabled: index >= sorted.length - 1,
      run: () => store.moveList(listId, index + 1),
    },
    ...(listId !== INBOX_ID
      ? [
          { separator: true } as const,
          { label: 'Supprimer la liste', icon: ICONS.trash, danger: true, run: () => void deleteList(listId) },
        ]
      : []),
  ]);
}

function navItem(
  id: ViewId,
  label: string,
  lead: HTMLElement,
  count: number,
  opts: { alert?: boolean; hint?: string } = {},
) {
  const active = currentView() === id;
  const btn = h(
    'button',
    {
      class: `nav-item${active ? ' active' : ''}`,
      dataset: { dropView: id },
      title: opts.hint ? `${label} (${opts.hint})` : label,
      on: { click: () => setView(id) },
    },
    lead,
    h('span', { class: 'nav-label', text: label }),
    count ? h('span', { class: `nav-count${opts.alert ? ' alert' : ''}`, text: String(count) }) : null,
  );
  return btn;
}

export function renderSidebar() {
  const counts = viewCounts(store.data);
  clear(navEl);
  for (const v of SMART) {
    const count =
      v.id === 'today' ? counts.today : v.id === 'upcoming' ? counts.upcoming : v.id === 'all' ? counts.all : 0;
    navEl.append(
      navItem(v.id, v.label, h('span', { class: 'nav-icon', html: v.icon }), count, {
        alert: v.id === 'today' && counts.overdue > 0,
        hint: `Ctrl+${v.key}`,
      }),
    );
  }

  clear(listsEl);
  store.sortedLists.forEach((l, i) => {
    const item = navItem(
      `list:${l.id}`,
      l.name,
      h('span', { class: 'nav-dot', style: { background: l.color } }),
      counts.perList.get(l.id) ?? 0,
      { hint: i < 5 ? `Ctrl+${i + 5}` : undefined },
    );
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      listMenu(l.id, { x: e.clientX, y: e.clientY });
    });
    item.addEventListener('dblclick', async () => {
      const name = await promptDialog('Renommer la liste', l.name, 'Renommer');
      if (name) store.updateList(l.id, { name });
    });
    listsEl.append(item);
  });
}

export function mountSidebar(aside: HTMLElement) {
  navEl = h('nav', { class: 'nav' });
  listsEl = h('nav', { class: 'nav nav-lists' });
  aside.append(
    h(
      'div',
      { class: 'sidebar-top' },
      h('img', { class: 'brand-icon', attrs: { src: './icon.png', alt: '' } }),
      h('span', { class: 'brand', text: 'TaskHelper' }),
    ),
    h(
      'button',
      { class: 'search-btn', on: { click: () => emit('palette:open') } },
      h('span', { html: ICONS.search }),
      h('span', { class: 'search-label', text: 'Rechercher…' }),
      h('kbd', { text: 'Ctrl K' }),
    ),
    h(
      'div',
      { class: 'sidebar-scroll' },
      navEl,
      h(
        'div',
        { class: 'nav-head' },
        h('span', { text: 'Listes' }),
        iconButton(ICONS.plus, 'Nouvelle liste', () => void createList(), 'small'),
      ),
      listsEl,
    ),
    h(
      'div',
      { class: 'sidebar-foot' },
      iconButton(ICONS.settings, 'Réglages (Ctrl+,)', () => emit('settings:open')),
      iconButton(ICONS.keyboard, 'Raccourcis clavier (F1)', () => emit('shortcuts:open')),
      iconButton(ICONS.moon, 'Thème clair / sombre (Ctrl+Maj+L)', () => {
        const dark = document.documentElement.dataset.theme === 'dark';
        store.setSettings({ theme: dark ? 'light' : 'dark' });
      }),
    ),
  );
  renderSidebar();
}
