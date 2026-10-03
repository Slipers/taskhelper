import './style.css';
import { todayKey } from './core/dates';
import { Store } from './core/store';
import type { ViewId } from './core/types';
import { viewCounts } from './core/views';
import {
  applyDesktopPrefs,
  onAppCommand,
  readData,
  readSettings,
  setBadge,
  setNativeTheme,
  writeAllSync,
  writeData,
  writeSettings,
} from './io/storage';
import { mountDetail, refreshDetail } from './ui/detail';
import { h, isTyping } from './ui/dom';
import { closeFocus, isFocusOpen, openFocus, refreshFocus } from './ui/focus';
import { closeAllPopovers, hasOpenPopover } from './ui/menu';
import { isModalOpen, toast } from './ui/modal';
import { isPaletteOpen, openPalette } from './ui/palette';
import { startReminders } from './ui/reminders';
import { openSettings } from './ui/settings';
import { openShortcuts } from './ui/shortcuts';
import { mountSidebar, renderSidebar } from './ui/sidebar';
import { closeDetail, emit, initState, on, setView, store, ui } from './ui/state';
import { handleListKey, mountTaskView, refreshHead, refreshSelection, render } from './ui/taskview';
import { initUpdateCard } from './ui/update-card';
import { maybeShowWhatsNew } from './ui/whatsnew';

/* ----------------------------------------------------------------- thème */

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const pref = store.settings.theme;
  const theme = pref === 'system' ? (darkQuery.matches ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty('--accent', store.settings.accent);
  setNativeTheme(theme);
}

/* --------------------------------------------------------------- clavier */

const SMART_ORDER: ViewId[] = ['today', 'upcoming', 'all', 'done'];

function onKeyDown(e: KeyboardEvent) {
  if (isFocusOpen() || isPaletteOpen()) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'k') {
    e.preventDefault();
    closeAllPopovers();
    openPalette();
    return;
  }
  if (isModalOpen() || hasOpenPopover()) return;

  // Annuler / rétablir : seulement hors d'un champ, qui garde son propre historique.
  if (mod && !isTyping(e.target) && (key === 'z' || key === 'y')) {
    e.preventDefault();
    const redo = key === 'y' || e.shiftKey;
    const ok = redo ? store.redo() : store.undo();
    if (!ok) toast(redo ? 'Rien à rétablir' : 'Rien à annuler');
    return;
  }
  if (mod && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const n = Number(e.key);
    if (n <= 4) setView(SMART_ORDER[n - 1]!);
    else {
      const list = store.sortedLists[n - 5];
      if (list) setView(`list:${list.id}`);
    }
    return;
  }
  if (mod && key === 'b') {
    e.preventDefault();
    store.setSettings({ sidebarCollapsed: !store.settings.sidebarCollapsed });
    return;
  }
  if (mod && e.key === ',') {
    e.preventDefault();
    openSettings();
    return;
  }
  if (mod && e.shiftKey && key === 'l') {
    e.preventDefault();
    store.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
    return;
  }
  if (e.key === 'F1') {
    e.preventDefault();
    openShortcuts();
    return;
  }
  if (mod && key === 'n') {
    e.preventDefault();
    emit('quickadd:focus');
    return;
  }

  if (isTyping(e.target)) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
    return;
  }

  if (!mod && !e.altKey && (key === 'n' || key === '/')) {
    e.preventDefault();
    emit('quickadd:focus');
    return;
  }
  if (!mod && e.key === '?') {
    e.preventDefault();
    openShortcuts();
    return;
  }
  if (handleListKey(e)) {
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') {
    if (ui.detailOpen) closeDetail();
    else store.select(null);
  }
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  const [data, settings] = await Promise.all([readData(), readSettings()]);
  initState(new Store(data, settings, { data: writeData, settings: writeSettings }));

  applyTheme();
  darkQuery.addEventListener('change', applyTheme);

  const app = document.getElementById('app')!;
  const sidebar = h('aside', { class: 'sidebar' });
  const main = h('main', { class: 'main' });
  const detail = h('aside', { class: 'detail', attrs: { 'aria-label': 'Détail de la tâche' } });
  app.append(sidebar, main, detail);
  document.body.classList.toggle('sidebar-collapsed', store.settings.sidebarCollapsed);

  mountSidebar(sidebar);
  mountTaskView(main);
  mountDetail(detail);

  let lastPrefs = '';
  const syncDesktop = () => {
    const prefs = {
      closeToTray: store.settings.closeToTray,
      launchAtLogin: store.settings.launchAtLogin,
      globalShortcut: store.settings.globalShortcut,
    };
    const sig = JSON.stringify(prefs);
    if (sig !== lastPrefs) {
      lastPrefs = sig;
      applyDesktopPrefs(prefs);
    }
  };
  const syncBadge = () => {
    const c = viewCounts(store.data);
    setBadge(c.today);
  };
  syncDesktop();
  syncBadge();

  let lastView = store.settings.lastView;
  let lastPlanOpen = ui.planOpen;
  store.subscribe((kind) => {
    if (kind === 'data') {
      render();
      renderSidebar();
      refreshDetail();
      refreshFocus();
      syncBadge();
    } else if (kind === 'settings') {
      applyTheme();
      document.body.classList.toggle('sidebar-collapsed', store.settings.sidebarCollapsed);
      syncDesktop();
      if (store.settings.lastView !== lastView) {
        lastView = store.settings.lastView;
        // Changer de vue repart du haut, sans animation de réordonnancement parasite.
        document.querySelector('.main-scroll')?.scrollTo({ top: 0 });
        document.querySelector('.sections')?.replaceChildren();
      }
      render();
      renderSidebar();
    } else {
      refreshSelection();
      refreshDetail();
      if (ui.planOpen !== lastPlanOpen) {
        lastPlanOpen = ui.planOpen;
        render();
      }
    }
  });

  on('focus:start', (id) => openFocus(id));
  on('palette:open', () => openPalette());
  on('settings:open', () => openSettings());
  on('shortcuts:open', () => openShortcuts());

  document.addEventListener('keydown', onKeyDown);

  onAppCommand((command) => {
    if (command === 'quickadd') {
      if (isFocusOpen()) closeFocus();
      closeAllPopovers();
      emit('quickadd:focus');
    }
  });

  // Enregistrement synchrone à la fermeture : un enregistrement différé en attente ne doit pas se perdre.
  window.addEventListener('beforeunload', () => writeAllSync(store.data, store.settings));

  // Passage à minuit (ou réveil de veille) : les vues « Aujourd'hui » et « À venir » se recalent.
  let day = todayKey();
  setInterval(() => {
    if (todayKey() === day) return;
    day = todayKey();
    render();
    renderSidebar();
    syncBadge();
  }, 30_000);
  // L'heure de fin estimée bouge avec l'horloge.
  setInterval(() => {
    if (store.settings.lastView === 'today' && !document.hidden) refreshHead();
  }, 60_000);

  startReminders();
  initUpdateCard();
  void maybeShowWhatsNew();
}

void boot();
