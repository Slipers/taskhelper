import { timeToMinutes, todayKey } from '../core/dates';
import type { ID } from '../core/types';
import { showWindow } from '../io/storage';
import { openDetail, setView, store } from './state';

const LS_FIRED = 'taskhelper:reminded';

/** Rappels déjà envoyés aujourd'hui (clé tâche+jour+heure), conservés à travers un rechargement. */
function firedSet(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FIRED) ?? '{}') as { day?: string; keys?: string[] };
    return raw.day === todayKey() ? new Set(raw.keys ?? []) : new Set();
  } catch {
    return new Set();
  }
}

function saveFired(set: Set<string>) {
  try {
    localStorage.setItem(LS_FIRED, JSON.stringify({ day: todayKey(), keys: [...set] }));
  } catch {
    /* stockage indisponible : au pire un rappel en double après rechargement */
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function notify(title: string, body: string, taskId?: ID) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, silent: !store.settings.sounds, tag: taskId });
  n.onclick = () => {
    showWindow();
    if (taskId && store.task(taskId)) {
      const t = store.task(taskId)!;
      if (t.date && t.date <= todayKey()) setView('today');
      openDetail(taskId);
    }
  };
}

function check() {
  if (!store.settings.reminders) return;
  const today = todayKey();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lead = store.settings.reminderLead;
  const fired = firedSet();
  let changed = false;
  for (const t of store.data.tasks) {
    if (t.done || t.date !== today || !t.time) continue;
    const at = timeToMinutes(t.time);
    const key = `${t.id}@${t.date}T${t.time}`;
    if (fired.has(key)) continue;
    // Fenêtre de 30 min : on ne réveille pas l'utilisateur pour un rappel vieux de trois heures.
    if (nowMin >= at - lead && nowMin <= at + 30) {
      fired.add(key);
      changed = true;
      const body = lead > 0 && nowMin < at ? `Dans ${at - nowMin} min · ${t.time}` : `Maintenant · ${t.time}`;
      notify(t.title, body, t.id);
    }
  }
  if (changed) saveFired(fired);
}

export function startReminders() {
  void ensurePermission();
  check();
  setInterval(check, 20_000);
}
