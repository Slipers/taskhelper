import { nextOccurrence, todayKey } from './dates';
import type { AppData, AppSettings, ID, Subtask, Task, TaskList } from './types';
import { INBOX_ID, LIST_COLORS } from './types';

export function uid(): ID {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export type ChangeKind = 'data' | 'settings' | 'ui';

type Listener = (kind: ChangeKind) => void;

const UNDO_LIMIT = 80;
/** Deux modifications de même clé rapprochées (frappe au clavier) ne font qu'une entrée d'annulation. */
const COALESCE_MS = 1500;

/**
 * Source de vérité unique de l'app. Toute écriture passe par `mutate`, qui
 * prend un instantané pour l'annulation, prévient les abonnés et programme
 * l'enregistrement sur disque.
 */
export class Store {
  data: AppData;
  settings: AppSettings;
  selectedId: ID | null = null;

  private listeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastCoalesce: { key: string; at: number } | null = null;
  private saveTimer = 0;
  private settingsTimer = 0;

  constructor(
    data: AppData,
    settings: AppSettings,
    private persist: { data: (d: AppData) => Promise<void>; settings: (s: AppSettings) => Promise<void> },
  ) {
    this.data = data;
    this.settings = settings;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(kind: ChangeKind) {
    for (const fn of this.listeners) fn(kind);
  }

  /* ------------------------------------------------------- écriture */

  mutate(fn: (data: AppData) => void, options: { coalesce?: string; undoable?: boolean } = {}) {
    if (options.undoable !== false) {
      const now = Date.now();
      const sameBurst =
        options.coalesce && this.lastCoalesce?.key === options.coalesce && now - this.lastCoalesce.at < COALESCE_MS;
      if (!sameBurst) {
        this.undoStack.push(JSON.stringify(this.data));
        if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      }
      this.lastCoalesce = options.coalesce ? { key: options.coalesce, at: now } : null;
      this.redoStack.length = 0;
    }
    fn(this.data);
    this.scheduleSave();
    this.emit('data');
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(prev);
    this.lastCoalesce = null;
    this.scheduleSave();
    this.emit('data');
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(next);
    this.lastCoalesce = null;
    this.scheduleSave();
    this.emit('data');
    return true;
  }

  /** Remplace tout (import) ; reste annulable. */
  replaceData(data: AppData) {
    this.mutate((d) => {
      d.lists = data.lists;
      d.tasks = data.tasks;
    });
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist.data(this.data), 250);
  }

  /** À appeler avant fermeture : écrit immédiatement ce qui attend encore. */
  flush() {
    clearTimeout(this.saveTimer);
    clearTimeout(this.settingsTimer);
    void this.persist.data(this.data);
    void this.persist.settings(this.settings);
  }

  setSettings(patch: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...patch };
    clearTimeout(this.settingsTimer);
    this.settingsTimer = window.setTimeout(() => void this.persist.settings(this.settings), 200);
    this.emit('settings');
  }

  select(id: ID | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit('ui');
  }

  /* -------------------------------------------------------- lecture */

  task(id: ID | null): Task | undefined {
    return id ? this.data.tasks.find((t) => t.id === id) : undefined;
  }

  list(id: ID): TaskList | undefined {
    return this.data.lists.find((l) => l.id === id);
  }

  get sortedLists(): TaskList[] {
    return [...this.data.lists].sort((a, b) => a.order - b.order);
  }

  /* ---------------------------------------------------------- tâches */

  addTask(partial: Partial<Task> & { title: string }, position: 'top' | 'bottom' = 'bottom'): Task {
    const orders = this.data.tasks.map((t) => t.order);
    const order = orders.length ? (position === 'top' ? Math.min(...orders) - 1 : Math.max(...orders) + 1) : 0;
    const now = Date.now();
    const task: Task = {
      id: uid(),
      notes: '',
      listId: INBOX_ID,
      date: null,
      time: null,
      priority: 0,
      estimate: null,
      recur: null,
      subtasks: [],
      done: false,
      doneAt: null,
      order,
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    if (!this.list(task.listId)) task.listId = INBOX_ID;
    this.mutate((d) => d.tasks.push(task));
    return task;
  }

  updateTask(id: ID, patch: Partial<Task>, coalesce?: string) {
    this.mutate(
      (d) => {
        const t = d.tasks.find((x) => x.id === id);
        if (!t) return;
        Object.assign(t, patch, { updatedAt: Date.now() });
        if (!t.date) t.time = null;
      },
      coalesce ? { coalesce: `${id}:${coalesce}` } : {},
    );
  }

  updateMany(ids: ID[], patch: Partial<Task>) {
    const set = new Set(ids);
    this.mutate((d) => {
      for (const t of d.tasks) {
        if (!set.has(t.id)) continue;
        Object.assign(t, patch, { updatedAt: Date.now() });
        if (!t.date) t.time = null;
      }
    });
  }

  /**
   * Coche ou décoche. Une tâche récurrente cochée reste dans l'historique et
   * engendre aussitôt sa prochaine occurrence, sous-tâches remises à zéro.
   * Renvoie la nouvelle occurrence le cas échéant.
   */
  toggleDone(id: ID): Task | null {
    let spawned: Task | null = null;
    this.mutate((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      t.updatedAt = Date.now();
      if (t.done && t.recur) {
        const base = t.date ?? todayKey();
        let next = nextOccurrence(base, t.recur);
        // Une tâche quotidienne en retard de trois jours ne doit pas en laisser trois autres derrière elle.
        const today = todayKey();
        while (next < today) next = nextOccurrence(next, t.recur);
        spawned = {
          ...structuredClone(t),
          id: uid(),
          date: next,
          done: false,
          doneAt: null,
          subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        // L'occurrence terminée n'est plus récurrente : seule la suivante porte la règle.
        t.recur = null;
        d.tasks.push(spawned);
      }
    });
    return spawned;
  }

  deleteTasks(ids: ID[]) {
    const set = new Set(ids);
    this.mutate((d) => {
      d.tasks = d.tasks.filter((t) => !set.has(t.id));
    });
    if (this.selectedId && set.has(this.selectedId)) this.select(null);
  }

  duplicateTask(id: ID): Task | null {
    const t = this.task(id);
    if (!t) return null;
    const copy: Task = {
      ...structuredClone(t),
      id: uid(),
      title: t.title,
      done: false,
      doneAt: null,
      subtasks: t.subtasks.map((s) => ({ ...s, id: uid() })),
      order: t.order + 0.0001,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.mutate((d) => d.tasks.push(copy));
    return copy;
  }

  /** Place `id` entre deux voisins d'ordre manuel (null = extrémité). */
  reorder(id: ID, before: ID | null, after: ID | null, patch: Partial<Task> = {}) {
    const prev = before ? this.task(before)?.order : undefined;
    const next = after ? this.task(after)?.order : undefined;
    let order: number;
    if (prev !== undefined && next !== undefined) order = (prev + next) / 2;
    else if (prev !== undefined) order = prev + 1;
    else if (next !== undefined) order = next - 1;
    else order = this.task(id)?.order ?? 0;
    this.updateTask(id, { ...patch, order });
  }

  clearCompleted(ids: ID[]) {
    this.deleteTasks(ids);
  }

  /* ----------------------------------------------------- sous-tâches */

  addSubtask(taskId: ID, title: string, index?: number): Subtask {
    const sub: Subtask = { id: uid(), title, done: false };
    this.mutate((d) => {
      const t = d.tasks.find((x) => x.id === taskId);
      if (!t) return;
      if (index === undefined) t.subtasks.push(sub);
      else t.subtasks.splice(index, 0, sub);
      t.updatedAt = Date.now();
    });
    return sub;
  }

  updateSubtask(taskId: ID, subId: ID, patch: Partial<Subtask>, coalesce?: string) {
    this.mutate(
      (d) => {
        const s = d.tasks.find((x) => x.id === taskId)?.subtasks.find((x) => x.id === subId);
        if (s) Object.assign(s, patch);
      },
      coalesce ? { coalesce: `${subId}:${coalesce}` } : {},
    );
  }

  removeSubtask(taskId: ID, subId: ID) {
    this.mutate((d) => {
      const t = d.tasks.find((x) => x.id === taskId);
      if (t) t.subtasks = t.subtasks.filter((s) => s.id !== subId);
    });
  }

  moveSubtask(taskId: ID, subId: ID, toIndex: number) {
    this.mutate((d) => {
      const t = d.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const from = t.subtasks.findIndex((s) => s.id === subId);
      if (from < 0) return;
      const [s] = t.subtasks.splice(from, 1);
      t.subtasks.splice(Math.max(0, Math.min(toIndex, t.subtasks.length)), 0, s!);
    });
  }

  /* ---------------------------------------------------------- listes */

  addList(name: string): TaskList {
    const used = new Set(this.data.lists.map((l) => l.color));
    const list: TaskList = {
      id: uid(),
      name,
      color: LIST_COLORS.find((c) => !used.has(c)) ?? LIST_COLORS[this.data.lists.length % LIST_COLORS.length]!,
      order: Math.max(0, ...this.data.lists.map((l) => l.order)) + 1,
    };
    this.mutate((d) => d.lists.push(list));
    return list;
  }

  updateList(id: ID, patch: Partial<TaskList>) {
    this.mutate((d) => {
      const l = d.lists.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    });
  }

  /** Supprime une liste et toutes ses tâches. La liste par défaut est indestructible. */
  deleteList(id: ID) {
    if (id === INBOX_ID) return;
    this.mutate((d) => {
      d.lists = d.lists.filter((l) => l.id !== id);
      d.tasks = d.tasks.filter((t) => t.listId !== id);
    });
  }

  moveList(id: ID, toIndex: number) {
    this.mutate((d) => {
      const sorted = [...d.lists].sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((l) => l.id === id);
      if (from < 0) return;
      const [l] = sorted.splice(from, 1);
      sorted.splice(toIndex, 0, l!);
      sorted.forEach((x, i) => (x.order = i));
    });
  }
}
