export type ID = string;

/** Jour local au format `YYYY-MM-DD` — jamais d'heure ni de fuseau, pour qu'une tâche ne glisse pas d'un jour. */
export type DayKey = string;

/** 0 = aucune, 1 = basse, 2 = moyenne, 3 = haute. */
export type Priority = 0 | 1 | 2 | 3;

export type RecurKind = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  kind: RecurKind;
  /** Tous les N jours / semaines / mois / ans. Ignoré pour `weekdays`. */
  every: number;
}

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task {
  id: ID;
  title: string;
  notes: string;
  listId: ID;
  date: DayKey | null;
  /** `HH:MM`, seulement si `date` est posée. */
  time: string | null;
  priority: Priority;
  /** Durée estimée en minutes. */
  estimate: number | null;
  recur: Recurrence | null;
  subtasks: Subtask[];
  done: boolean;
  doneAt: number | null;
  /** Ordre manuel, partagé entre toutes les vues : on insère entre deux voisins par moyenne. */
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskList {
  id: ID;
  name: string;
  color: string;
  order: number;
}

export interface AppData {
  version: 1;
  lists: TaskList[];
  tasks: Task[];
}

export type SortMode = 'manual' | 'priority' | 'time' | 'title';

export type ViewId = 'today' | 'upcoming' | 'all' | 'done' | `list:${string}`;

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  accent: string;
  /** Notification à l'heure d'une tâche planifiée. */
  reminders: boolean;
  /** Minutes d'avance de la notification. */
  reminderLead: number;
  /** Heures de travail disponibles par jour, pour la jauge de charge. */
  dayCapacity: number;
  focusMinutes: number;
  breakMinutes: number;
  sounds: boolean;
  closeToTray: boolean;
  launchAtLogin: boolean;
  globalShortcut: boolean;
  sidebarCollapsed: boolean;
  sort: Partial<Record<string, SortMode>>;
  /** Sections repliées, par clé `vue:section`. */
  collapsed: Record<string, boolean>;
  lastView: ViewId;
  /** Dernière version dont l'utilisateur a vu les nouveautés. */
  lastSeenVersion: string;
}

export const INBOX_ID = 'inbox';

export const LIST_COLORS = ['#4c8dff', '#22b07d', '#f0a020', '#f0556d', '#a46cf5', '#16b4c9', '#e2669f', '#8a93a6'];

export const ACCENTS = ['#4c8dff', '#22b07d', '#a46cf5', '#f0556d', '#f0a020', '#16b4c9'];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: '#4c8dff',
  reminders: true,
  reminderLead: 0,
  dayCapacity: 6,
  focusMinutes: 25,
  breakMinutes: 5,
  sounds: true,
  closeToTray: false,
  launchAtLogin: false,
  globalShortcut: true,
  sidebarCollapsed: false,
  sort: {},
  collapsed: {},
  lastView: 'today',
  lastSeenVersion: '',
};

export function emptyData(): AppData {
  return {
    version: 1,
    lists: [{ id: INBOX_ID, name: 'Mes tâches', color: LIST_COLORS[0]!, order: 0 }],
    tasks: [],
  };
}
