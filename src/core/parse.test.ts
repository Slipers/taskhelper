import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './parse';
import { nextOccurrence } from './dates';
import type { TaskList } from './types';

// Samedi 3 octobre 2026.
const TODAY = '2026-10-03';
const LISTS: TaskList[] = [
  { id: 'inbox', name: 'Mes tâches', color: '#000', order: 0 },
  { id: 'work', name: 'Travail', color: '#000', order: 1 },
  { id: 'shop', name: 'Courses maison', color: '#000', order: 2 },
];
const p = (s: string) => parseQuickAdd(s, LISTS, TODAY);

describe('parseQuickAdd', () => {
  it('laisse un titre simple intact', () => {
    expect(p('Acheter du pain')).toMatchObject({ title: 'Acheter du pain', date: null, time: null, priority: null });
  });

  it('reconnaît les jours relatifs', () => {
    expect(p('Appeler Paul demain')).toMatchObject({ title: 'Appeler Paul', date: '2026-10-04' });
    expect(p("Sport aujourd'hui")).toMatchObject({ title: 'Sport', date: TODAY });
    expect(p('Dentiste après-demain')).toMatchObject({ title: 'Dentiste', date: '2026-10-05' });
    expect(p('Rapport dans 3 jours')).toMatchObject({ title: 'Rapport', date: '2026-10-06' });
    expect(p('Bilan dans deux semaines')).toMatchObject({ title: 'Bilan', date: '2026-10-17' });
  });

  it('reconnaît les jours de la semaine, toujours dans le futur', () => {
    expect(p('Réunion lundi')).toMatchObject({ title: 'Réunion', date: '2026-10-05' });
    expect(p('Réunion vendredi prochain')).toMatchObject({ date: '2026-10-09' });
    expect(p('Ménage ce week-end')).toMatchObject({ title: 'Ménage', date: TODAY });
    expect(parseQuickAdd('Ménage ce week-end', LISTS, '2026-10-01')).toMatchObject({ date: '2026-10-03' });
  });

  it('reconnaît les dates explicites', () => {
    expect(p('Impôts le 15/10')).toMatchObject({ title: 'Impôts', date: '2026-10-15' });
    expect(p('Anniversaire 2/1')).toMatchObject({ date: '2027-01-02' });
    expect(p('Vacances le 20 décembre')).toMatchObject({ title: 'Vacances', date: '2026-12-20' });
    expect(p('Loyer le 1er')).toMatchObject({ title: 'Loyer', date: '2026-11-01' });
  });

  it('reconnaît les heures et pose aujourd’hui par défaut', () => {
    expect(p('Cours de piano à 14h')).toMatchObject({ title: 'Cours de piano', date: TODAY, time: '14:00' });
    expect(p('Train demain 8h45')).toMatchObject({ title: 'Train', date: '2026-10-04', time: '08:45' });
    expect(p('Call 9:30')).toMatchObject({ time: '09:30' });
    expect(p('Dîner demain soir')).toMatchObject({ title: 'Dîner', time: '19:00' });
    expect(p('Rendez-vous le 14h')).toMatchObject({ time: '14:00' });
  });

  it('reconnaît priorité, durée et liste', () => {
    expect(p('Rendre le dossier !!! #travail ~1h30')).toMatchObject({
      title: 'Rendre le dossier',
      priority: 3,
      listId: 'work',
      estimate: 90,
      time: null,
    });
    expect(p('Lait #courses !1')).toMatchObject({ title: 'Lait', listId: 'shop', priority: 3 });
    expect(p('Lire ~20m')).toMatchObject({ title: 'Lire', estimate: 20 });
    expect(p('Note #inconnue')).toMatchObject({ title: 'Note #inconnue', listId: null });
  });

  it('reconnaît les récurrences', () => {
    expect(p('Méditer tous les jours')).toMatchObject({
      title: 'Méditer',
      recur: { kind: 'daily', every: 1 },
      date: TODAY,
    });
    expect(p('Sortir les poubelles tous les mardis')).toMatchObject({
      title: 'Sortir les poubelles',
      recur: { kind: 'weekly', every: 1 },
      date: '2026-10-06',
    });
    expect(p('Stand-up en semaine 9h30')).toMatchObject({ recur: { kind: 'weekdays' }, time: '09:30' });
    expect(p('Factures chaque mois le 5')).toMatchObject({ recur: { kind: 'monthly' }, date: '2026-10-05' });
  });

  it('ne garde que la première date', () => {
    expect(p('Demain ou lundi')).toMatchObject({ date: '2026-10-04', title: 'ou lundi' });
  });
});

describe('nextOccurrence', () => {
  it('saute le week-end en semaine', () => {
    expect(nextOccurrence('2026-10-02', { kind: 'weekdays', every: 1 })).toBe('2026-10-05');
  });
  it('reste sur la fin du mois', () => {
    expect(nextOccurrence('2026-01-31', { kind: 'monthly', every: 1 })).toBe('2026-02-28');
  });
});
