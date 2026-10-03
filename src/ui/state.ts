import type { Store } from '../core/store';
import type { ID, ViewId } from '../core/types';

/**
 * État d'interface partagé entre les panneaux. Le store porte les données ;
 * ici, seulement ce qui décrit ce que l'utilisateur regarde.
 */
export let store!: Store;

export const ui = {
  /** Le panneau de détail est-il ouvert sur la tâche sélectionnée ? */
  detailOpen: false,
  /** Tâche dont la ligne vient d'être créée : jouer l'animation d'entrée. */
  justAdded: null as ID | null,
  /** Panneau « Planifier ma journée » déplié. */
  planOpen: false,
};

export function initState(s: Store) {
  store = s;
}

export function currentView(): ViewId {
  return store.settings.lastView;
}

export function setView(view: ViewId) {
  if (view.startsWith('list:') && !store.list(view.slice(5))) view = 'today';
  if (store.settings.lastView === view) return;
  ui.planOpen = false;
  store.setSettings({ lastView: view });
}

export function openDetail(id: ID) {
  ui.detailOpen = true;
  store.select(id);
  store.emit('ui');
}

export function closeDetail() {
  if (!ui.detailOpen) return;
  ui.detailOpen = false;
  store.emit('ui');
}

/* Petit bus d'évènements entre modules d'interface, pour éviter les imports circulaires. */
type Events = {
  'quickadd:focus': void;
  'focus:start': ID | null;
  'palette:open': void;
  'settings:open': void;
  'shortcuts:open': void;
  'rename:task': ID;
};

const handlers = new Map<string, Set<(payload: never) => void>>();

export function on<K extends keyof Events>(name: K, fn: (payload: Events[K]) => void) {
  let set = handlers.get(name);
  if (!set) handlers.set(name, (set = new Set()));
  set.add(fn as (payload: never) => void);
}

export function emit<K extends keyof Events>(name: K, ...payload: Events[K] extends void ? [] : [Events[K]]) {
  for (const fn of handlers.get(name) ?? []) (fn as (p: unknown) => void)(payload[0]);
}
