import type { DayKey, Recurrence } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midi local plutôt que minuit : un changement d'heure ne fait jamais basculer le jour. */
export function fromKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
}

export function todayKey(now = new Date()): DayKey {
  return toKey(now);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Ajoute des mois en restant sur le dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function addMonths(key: DayKey, n: number): DayKey {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86_400_000);
}

/** 0 = lundi … 6 = dimanche. */
export function weekdayMon(key: DayKey): number {
  return (fromKey(key).getDay() + 6) % 7;
}

/** Prochaine occurrence (strictement après `from`) du jour de semaine donné, 0 = lundi. */
export function nextWeekday(from: DayKey, weekday: number): DayKey {
  const delta = (weekday - weekdayMon(from) + 7) % 7 || 7;
  return addDays(from, delta);
}

export const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
export const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Aujourd'hui », « Demain », « Hier », « Jeudi » (cette semaine), sinon « lun. 6 oct. ». */
export function formatDay(key: DayKey, today = todayKey()): string {
  const delta = diffDays(key, today);
  if (delta === 0) return 'Aujourd’hui';
  if (delta === 1) return 'Demain';
  if (delta === -1) return 'Hier';
  const d = fromKey(key);
  if (delta > 1 && delta < 7) return cap(WEEKDAYS[weekdayMon(key)]!);
  const sameYear = d.getFullYear() === fromKey(today).getFullYear();
  return `${WEEKDAYS_SHORT[weekdayMon(key)]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** « Vendredi 3 octobre » */
export function formatLongDay(key: DayKey): string {
  const d = fromKey(key);
  return `${cap(WEEKDAYS[weekdayMon(key)]!)} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

export function nowTime(now = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

export function minutesToTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Date de l'occurrence suivante d'une tâche récurrente. */
export function nextOccurrence(key: DayKey, recur: Recurrence): DayKey {
  const every = Math.max(1, recur.every || 1);
  switch (recur.kind) {
    case 'daily':
      return addDays(key, every);
    case 'weekdays': {
      let next = addDays(key, 1);
      while (weekdayMon(next) > 4) next = addDays(next, 1);
      return next;
    }
    case 'weekly':
      return addDays(key, 7 * every);
    case 'monthly':
      return addMonths(key, every);
    case 'yearly':
      return addMonths(key, 12 * every);
  }
}

export function describeRecurrence(recur: Recurrence, date: DayKey | null): string {
  const every = Math.max(1, recur.every || 1);
  switch (recur.kind) {
    case 'daily':
      return every === 1 ? 'Tous les jours' : `Tous les ${every} jours`;
    case 'weekdays':
      return 'Du lundi au vendredi';
    case 'weekly': {
      const day = date ? WEEKDAYS[weekdayMon(date)] : null;
      if (every === 1) return day ? `Tous les ${day}s` : 'Toutes les semaines';
      return `Toutes les ${every} semaines${day ? ` (${day})` : ''}`;
    }
    case 'monthly': {
      const dom = date ? fromKey(date).getDate() : null;
      const base = every === 1 ? 'Tous les mois' : `Tous les ${every} mois`;
      return dom ? `${base}, le ${dom}` : base;
    }
    case 'yearly':
      return every === 1 ? 'Tous les ans' : `Tous les ${every} ans`;
  }
}

/** Grille d'un mois pour le calendrier : semaines commençant le lundi, cases hors mois incluses. */
export function monthGrid(year: number, month: number): DayKey[][] {
  const first = toKey(new Date(year, month, 1, 12));
  let cursor = addDays(first, -weekdayMon(first));
  const weeks: DayKey[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DayKey[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (fromKey(cursor).getMonth() !== month) break;
  }
  return weeks;
}
