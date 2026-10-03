import { addDays, addMonths, fromKey, nextWeekday, todayKey, toKey, weekdayMon, WEEKDAYS } from './dates';
import type { DayKey, ID, Priority, Recurrence, TaskList } from './types';

/**
 * Saisie rapide en langage naturel : « Appeler Paul demain 14h !! #travail ~30m »
 * donne le titre « Appeler Paul » planifié demain à 14:00, priorité moyenne,
 * dans la liste Travail, estimé à 30 minutes.
 *
 * On travaille sur une copie normalisée (minuscules, sans accents) de même
 * longueur que le texte d'origine : les positions trouvées s'appliquent telles
 * quelles à l'original pour en retirer les morceaux reconnus.
 */

export interface ParsedTask {
  title: string;
  date: DayKey | null;
  time: string | null;
  priority: Priority | null;
  listId: ID | null;
  estimate: number | null;
  recur: Recurrence | null;
}

interface Ctx {
  out: ParsedTask;
  today: DayKey;
  lists: TaskList[];
}

type Rule = {
  /** Corps de l'expression, encadré automatiquement par des frontières de mot. */
  re: string;
  /** Renvoie false pour laisser le texte dans le titre (valeur invalide, champ déjà posé…). */
  apply: (m: RegExpExecArray, ctx: Ctx) => boolean;
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  quinze: 15,
};

const toInt = (s: string) => NUMBER_WORDS[s] ?? Number.parseInt(s, 10);

const WD = WEEKDAYS.join('|');
const MONTH_RE =
  'janv(?:ier)?|fevr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?';
const MONTH_PREFIXES = ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'];
const NUM = '\\d{1,2}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze';
const DATE_PREFIX = "(?:(?:pour|le|des|d['’]ici|a partir de|avant)\\s+)?";
const TIME_PREFIX = '(?:(?:a|vers|pour|des|avant)\\s+)?';

function monthIndex(word: string): number {
  if (word.startsWith('juil')) return 6;
  if (word.startsWith('juin')) return 5;
  return MONTH_PREFIXES.findIndex((p) => word.startsWith(p));
}

function setDate(ctx: Ctx, key: DayKey): boolean {
  if (ctx.out.date) return false;
  ctx.out.date = key;
  return true;
}

function setRecur(ctx: Ctx, recur: Recurrence): boolean {
  if (ctx.out.recur) return false;
  ctx.out.recur = recur;
  return true;
}

function setTime(ctx: Ctx, h: number, m: number): boolean {
  if (ctx.out.time || h > 23 || m > 59) return false;
  ctx.out.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return true;
}

/** Une date jj/mm sans année désigne la prochaine occurrence, jamais le passé. */
function dayMonth(ctx: Ctx, day: number, month: number, year?: number): boolean {
  if (month < 0 || month > 11 || day < 1 || day > 31) return false;
  const t = fromKey(ctx.today);
  let y = year ?? t.getFullYear();
  if (y < 100) y += 2000;
  const d = new Date(y, month, day, 12);
  if (d.getMonth() !== month) return false;
  let key = toKey(d);
  if (year === undefined && key < ctx.today) key = toKey(new Date(y + 1, month, day, 12));
  return setDate(ctx, key);
}

const RULES: Rule[] = [
  // La durée passe en premier : « ~1h30 » ne doit pas être lu comme une heure.
  {
    re: '~ ?(\\d{1,3}) ?(min|mn|m|h)(\\d{2})?',
    apply: (m, c) => {
      if (c.out.estimate !== null) return false;
      const n = +m[1]!;
      const minutes = m[2] === 'h' ? n * 60 + (m[3] ? +m[3] : 0) : n;
      if (minutes <= 0 || minutes > 24 * 60) return false;
      c.out.estimate = minutes;
      return true;
    },
  },
  /* ---------------------------------------------------- récurrence */
  {
    re: '(?:tous les|chaque) (\\d+) jours',
    apply: (m, c) => setRecur(c, { kind: 'daily', every: toInt(m[1]!) }),
  },
  {
    re: '(?:tous les jours|chaque jour|quotidien(?:ne)?(?:ment)?)',
    apply: (_m, c) => setRecur(c, { kind: 'daily', every: 1 }),
  },
  {
    re: '(?:en semaine|les jours ouvres|jours ouvres|du lundi au vendredi)',
    apply: (_m, c) => setRecur(c, { kind: 'weekdays', every: 1 }),
  },
  {
    re: `(?:tous les|chaque) (${WD})s?`,
    apply: (m, c) => {
      if (!setRecur(c, { kind: 'weekly', every: 1 })) return false;
      const wd = WEEKDAYS.indexOf(m[1]!);
      if (!c.out.date) c.out.date = weekdayMon(c.today) === wd ? c.today : nextWeekday(c.today, wd);
      return true;
    },
  },
  {
    re: 'toutes les (\\d+) semaines',
    apply: (m, c) => setRecur(c, { kind: 'weekly', every: toInt(m[1]!) }),
  },
  {
    re: '(?:toutes les semaines|chaque semaine|hebdo(?:madaire)?)',
    apply: (_m, c) => setRecur(c, { kind: 'weekly', every: 1 }),
  },
  {
    re: '(?:tous les|chaque) (\\d+) mois',
    apply: (m, c) => setRecur(c, { kind: 'monthly', every: toInt(m[1]!) }),
  },
  {
    re: '(?:tous les mois|chaque mois|mensuel(?:le)?(?:ment)?)',
    apply: (_m, c) => setRecur(c, { kind: 'monthly', every: 1 }),
  },
  {
    re: '(?:tous les ans|chaque annee|chaque an|annuel(?:le)?(?:ment)?)',
    apply: (_m, c) => setRecur(c, { kind: 'yearly', every: 1 }),
  },

  /* --------------------------------------------------------- dates */
  {
    re: `${DATE_PREFIX}(?:aujourd['’ ]?hui|auj)`,
    apply: (_m, c) => setDate(c, c.today),
  },
  {
    re: 'ce soir',
    apply: (_m, c) => {
      if (!setDate(c, c.today)) return false;
      setTime(c, 19, 0);
      return true;
    },
  },
  {
    re: `${DATE_PREFIX}apres[- ]demain`,
    apply: (_m, c) => setDate(c, addDays(c.today, 2)),
  },
  {
    re: `${DATE_PREFIX}demain(?: (matin|midi|soir|aprem|apres-midi))?`,
    apply: (m, c) => {
      if (!setDate(c, addDays(c.today, 1))) return false;
      const part = m[1];
      if (part === 'matin') setTime(c, 9, 0);
      else if (part === 'midi') setTime(c, 12, 0);
      else if (part === 'soir') setTime(c, 19, 0);
      else if (part) setTime(c, 14, 0);
      return true;
    },
  },
  {
    re: `${DATE_PREFIX}(?:ce )?(?:week-?end|we)`,
    apply: (_m, c) => {
      const wd = weekdayMon(c.today);
      return setDate(c, wd >= 5 ? c.today : nextWeekday(c.today, 5));
    },
  },
  {
    re: `${DATE_PREFIX}(?:la )?semaine prochaine`,
    apply: (_m, c) => setDate(c, nextWeekday(c.today, 0)),
  },
  {
    re: `${DATE_PREFIX}(?:le )?mois prochain`,
    apply: (_m, c) => {
      const t = fromKey(addMonths(c.today, 1));
      return setDate(c, toKey(new Date(t.getFullYear(), t.getMonth(), 1, 12)));
    },
  },
  {
    re: `dans (${NUM}) (jours?|semaines?|mois|ans?)`,
    apply: (m, c) => {
      const n = toInt(m[1]!);
      const unit = m[2]!;
      if (unit.startsWith('jour')) return setDate(c, addDays(c.today, n));
      if (unit.startsWith('semaine')) return setDate(c, addDays(c.today, 7 * n));
      if (unit === 'mois') return setDate(c, addMonths(c.today, n));
      return setDate(c, addMonths(c.today, 12 * n));
    },
  },
  {
    re: `${DATE_PREFIX}(?:ce |le )?(${WD})(?: prochain)?`,
    apply: (m, c) => setDate(c, nextWeekday(c.today, WEEKDAYS.indexOf(m[1]!))),
  },
  {
    re: `${DATE_PREFIX}(?:le )?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{4}|\\d{2}))?`,
    apply: (m, c) => dayMonth(c, +m[1]!, +m[2]! - 1, m[3] ? +m[3] : undefined),
  },
  {
    re: `${DATE_PREFIX}(?:le )?(\\d{1,2})(?:er)? (${MONTH_RE})\\.?(?: (\\d{4}))?`,
    apply: (m, c) => dayMonth(c, +m[1]!, monthIndex(m[2]!), m[3] ? +m[3] : undefined),
  },
  {
    // « le 12 » seul : ce mois-ci, ou le mois suivant si le jour est passé.
    re: '(?:pour |avant )?le (\\d{1,2})(?:er)?(?! ?(?:h|:|\\d|/|min|minutes?|heures?|jours?|semaines?|mois|ans?|fois|euros?|e|€|%)(?![a-z]))',
    apply: (m, c) => {
      const day = +m[1]!;
      if (day < 1 || day > 31) return false;
      const t = fromKey(c.today);
      for (let i = 0; i < 3; i++) {
        const d = new Date(t.getFullYear(), t.getMonth() + i, day, 12);
        if (d.getDate() !== day) continue;
        const key = toKey(d);
        if (key >= c.today) return setDate(c, key);
      }
      return false;
    },
  },

  /* ---------------------------------------------------------- heure */
  {
    re: `${TIME_PREFIX}(\\d{1,2}) ?h ?(\\d{2})?`,
    apply: (m, c) => setTime(c, +m[1]!, m[2] ? +m[2] : 0),
  },
  {
    re: `${TIME_PREFIX}(\\d{1,2}):(\\d{2})`,
    apply: (m, c) => setTime(c, +m[1]!, +m[2]!),
  },
  {
    re: `${TIME_PREFIX}midi`,
    apply: (_m, c) => setTime(c, 12, 0),
  },

  /* ------------------------------------------- priorité, durée, liste */
  {
    re: '!([123])',
    apply: (m, c) => {
      if (c.out.priority !== null) return false;
      c.out.priority = (4 - +m[1]!) as Priority;
      return true;
    },
  },
  {
    re: '(!{1,3})',
    apply: (m, c) => {
      if (c.out.priority !== null) return false;
      c.out.priority = m[1]!.length as Priority;
      return true;
    },
  },
  {
    re: '#([^\\s#]+)',
    apply: (m, c) => {
      if (c.out.listId) return false;
      const wanted = m[1]!;
      const match =
        c.lists.find((l) => compact(l.name) === wanted) ?? c.lists.find((l) => compact(l.name).startsWith(wanted));
      if (!match) return false;
      c.out.listId = match.id;
      return true;
    },
  },
];

const COMPILED = RULES.map((r) => ({
  // Frontières « lettre ou chiffre » plutôt que \b, qui ignore les lettres accentuées.
  re: new RegExp(`(?<![\\p{L}\\d])(?:${r.re})(?![\\p{L}\\d])`, 'giu'),
  apply: r.apply,
}));

/** Minuscules sans accents, caractère pour caractère (même longueur que l'entrée). */
export function normalize(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch.normalize('NFD')[0] ?? ch;
    const lower = base.toLowerCase();
    // Un caractère qui changerait de longueur en minuscule (rare) est gardé tel quel.
    out += lower.length === base.length ? lower : base;
  }
  return out;
}

function compact(name: string): string {
  return normalize(name).replace(/\s+/g, '');
}

export function parseQuickAdd(input: string, lists: TaskList[], today = todayKey()): ParsedTask {
  const out: ParsedTask = {
    title: '',
    date: null,
    time: null,
    priority: null,
    listId: null,
    estimate: null,
    recur: null,
  };
  const ctx: Ctx = { out, today, lists };
  const norm = normalize(input);
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s);

  for (const rule of COMPILED) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(norm))) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      if (overlaps(start, end)) continue;
      if (rule.apply(m, ctx)) taken.push([start, end]);
    }
  }

  // Une heure sans jour vise aujourd'hui ; une récurrence sans jour démarre aujourd'hui.
  if ((out.time || out.recur) && !out.date) out.date = today;

  taken.sort((a, b) => a[0] - b[0]);
  let title = '';
  let cursor = 0;
  for (const [s, e] of taken) {
    title += input.slice(cursor, s) + ' ';
    cursor = e;
  }
  title += input.slice(cursor);
  out.title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();
  if (!out.title) out.title = input.trim();
  return out;
}
