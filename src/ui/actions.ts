import { addDays, describeRecurrence, formatDay, nextWeekday, todayKey } from '../core/dates';
import type { DayKey, ID, Priority, RecurKind, Recurrence, Task } from '../core/types';
import { INBOX_ID } from '../core/types';
import { openDatePicker } from './datepicker';
import { ICONS } from './icons';
import { openMenu, type MenuEntry } from './menu';
import { confirmDialog, toast } from './modal';
import { playSound } from './sound';
import { emit, openDetail, store } from './state';

export const PRIORITY_LABELS: Record<Priority, string> = { 0: 'Aucune', 1: 'Basse', 2: 'Moyenne', 3: 'Haute' };

/** Durée laissée à l'animation de la case cochée avant que la ligne ne quitte sa section. */
const COMPLETE_DELAY = 360;
const pending = new Set<ID>();

/**
 * Coche une tâche avec son animation, puis l'enregistre. Décocher est
 * immédiat : il n'y a rien à célébrer.
 */
export function toggleComplete(id: ID) {
  const task = store.task(id);
  if (!task || pending.has(id)) return;
  const row = document.querySelector<HTMLElement>(`.task-row[data-id="${id}"]`);
  if (task.done) {
    store.toggleDone(id);
    return;
  }
  pending.add(id);
  row?.classList.add('completing');
  if (store.settings.sounds) playSound('done');
  setTimeout(
    () => {
      pending.delete(id);
      const spawned = store.toggleDone(id);
      const msg = spawned?.date ? `Terminée · prochaine ${formatDay(spawned.date).toLowerCase()}` : 'Tâche terminée';
      toast(msg, { label: 'Annuler', run: () => store.undo() });
    },
    row ? COMPLETE_DELAY : 0,
  );
}

export function deleteWithUndo(ids: ID[]) {
  if (!ids.length) return;
  store.deleteTasks(ids);
  toast(ids.length > 1 ? `${ids.length} tâches supprimées` : 'Tâche supprimée', {
    label: 'Annuler',
    run: () => store.undo(),
  });
}

export function schedule(id: ID, date: DayKey | null, time?: string | null) {
  const t = store.task(id);
  if (!t) return;
  store.updateTask(id, time === undefined ? { date } : { date, time });
}

export function pickDate(id: ID, anchor: HTMLElement | { x: number; y: number }) {
  const t = store.task(id);
  if (!t) return;
  openDatePicker(anchor, { date: t.date, time: t.time }, (p) => store.updateTask(id, { date: p.date, time: p.time }));
}

export function recurrenceEntries(task: Task): MenuEntry[] {
  const set = (recur: Recurrence | null) => {
    store.updateTask(task.id, { recur, date: recur && !task.date ? todayKey() : task.date });
  };
  const opt = (kind: RecurKind, every = 1): MenuEntry => {
    const recur = { kind, every };
    return {
      label: describeRecurrence(recur, task.date),
      checked: task.recur?.kind === kind && (task.recur.every || 1) === every,
      run: () => set(recur),
    };
  };
  return [
    { label: 'Ne se répète pas', checked: !task.recur, run: () => set(null) },
    { separator: true },
    opt('daily'),
    opt('weekdays'),
    opt('weekly'),
    opt('weekly', 2),
    opt('monthly'),
    opt('yearly'),
  ];
}

export function priorityEntries(ids: ID[], current: Priority | null): MenuEntry[] {
  return ([3, 2, 1, 0] as Priority[]).map((p) => ({
    label: PRIORITY_LABELS[p],
    icon: `<span class="prio-flag prio-${p}">${ICONS.flag}</span>`,
    hint: p === 0 ? '0' : String(4 - p),
    checked: current === p,
    run: () => store.updateMany(ids, { priority: p }),
  }));
}

export function listEntries(ids: ID[], current: ID | null): MenuEntry[] {
  return store.sortedLists.map((l) => ({
    label: l.name,
    color: l.color,
    checked: current === l.id,
    run: () => store.updateMany(ids, { listId: l.id }),
  }));
}

export function taskMenu(id: ID, anchor: HTMLElement | { x: number; y: number }) {
  const t = store.task(id);
  if (!t) return;
  const today = todayKey();
  const entries: MenuEntry[] = [
    {
      label: t.done ? 'Marquer à faire' : 'Terminer',
      icon: ICONS.checkCircle,
      hint: 'Espace',
      run: () => toggleComplete(id),
    },
    { label: 'Ouvrir le détail', icon: ICONS.note, hint: 'Entrée', run: () => openDetail(id) },
    { label: 'Renommer', icon: ICONS.edit, hint: 'F2', run: () => emit('rename:task', id) },
    { separator: true },
    { label: 'Aujourd’hui', icon: ICONS.sun, hint: 'T', checked: t.date === today, run: () => schedule(id, today) },
    {
      label: 'Demain',
      icon: ICONS.sunrise,
      hint: 'D',
      checked: t.date === addDays(today, 1),
      run: () => schedule(id, addDays(today, 1)),
    },
    {
      label: 'Semaine prochaine',
      icon: ICONS.arrowRight,
      hint: 'S',
      run: () => schedule(id, nextWeekday(today, 0)),
    },
    { label: 'Choisir une date…', icon: ICONS.calendar, run: () => pickDate(id, anchor) },
    ...(t.date
      ? [{ label: 'Retirer la date', icon: ICONS.close, hint: 'U', run: () => schedule(id, null) } as MenuEntry]
      : []),
    { separator: true },
    { label: 'Priorité', icon: ICONS.flag, submenu: priorityEntries([id], t.priority) },
    { label: 'Répétition', icon: ICONS.repeat, submenu: recurrenceEntries(t) },
    { label: 'Déplacer vers', icon: ICONS.move, submenu: listEntries([id], t.listId) },
    { separator: true },
    { label: 'Mode focus', icon: ICONS.target, hint: 'F', disabled: t.done, run: () => emit('focus:start', id) },
    { label: 'Dupliquer', icon: ICONS.copy, hint: 'Ctrl+D', run: () => store.duplicateTask(id) },
    { label: 'Supprimer', icon: ICONS.trash, hint: 'Suppr', danger: true, run: () => deleteWithUndo([id]) },
  ];
  openMenu(anchor, entries);
}

export async function deleteList(id: ID) {
  if (id === INBOX_ID) return;
  const list = store.list(id);
  if (!list) return;
  const count = store.data.tasks.filter((t) => t.listId === id).length;
  const ok = await confirmDialog(
    'Supprimer la liste',
    count
      ? `« ${list.name} » et ses ${count} tâche${count > 1 ? 's' : ''} seront supprimées. Vous pourrez encore annuler avec Ctrl+Z.`
      : `Supprimer la liste « ${list.name} » ?`,
    'Supprimer',
  );
  if (!ok) return;
  if (store.settings.lastView === `list:${id}`) store.setSettings({ lastView: 'today' });
  store.deleteList(id);
  toast('Liste supprimée', { label: 'Annuler', run: () => store.undo() });
}

/** Reporte toutes les tâches en retard à aujourd'hui, en une seule étape d'annulation. */
export function rescheduleOverdue() {
  const today = todayKey();
  const ids = store.data.tasks.filter((t) => !t.done && t.date && t.date < today).map((t) => t.id);
  if (!ids.length) return;
  store.updateMany(ids, { date: today });
  toast(`${ids.length} tâche${ids.length > 1 ? 's' : ''} reportée${ids.length > 1 ? 's' : ''} à aujourd’hui`, {
    label: 'Annuler',
    run: () => store.undo(),
  });
}
