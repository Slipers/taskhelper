import {
  addDays,
  formatDay,
  fromKey,
  monthGrid,
  MONTHS,
  nextWeekday,
  todayKey,
  weekdayMon,
  WEEKDAYS_SHORT,
} from '../core/dates';
import { parseQuickAdd } from '../core/parse';
import type { DayKey } from '../core/types';
import { h, clear } from './dom';
import { ICONS } from './icons';
import { closeAllPopovers, openPopover } from './menu';

export interface DatePick {
  date: DayKey | null;
  time: string | null;
}

/**
 * Sélecteur de date : raccourcis, saisie libre (« vendredi 15h »), mini
 * calendrier et heure. Chaque choix est appliqué immédiatement.
 */
export function openDatePicker(
  anchor: HTMLElement | { x: number; y: number },
  current: DatePick,
  onPick: (pick: DatePick) => void,
) {
  const today = todayKey();
  let shown = fromKey(current.date ?? today);
  let time = current.time;

  const pick = (date: DayKey | null, close = true) => {
    onPick({ date, time: date ? time : null });
    if (close) closeAllPopovers();
  };

  const wd = weekdayMon(today);
  const presets: Array<{ label: string; hint: string; icon: string; date: DayKey | null }> = [
    { label: 'Aujourd’hui', hint: WEEKDAYS_SHORT[wd]!, icon: ICONS.sun, date: today },
    { label: 'Demain', hint: WEEKDAYS_SHORT[(wd + 1) % 7]!, icon: ICONS.sunrise, date: addDays(today, 1) },
    { label: 'Ce week-end', hint: 'sam.', icon: ICONS.calendar, date: wd >= 5 ? today : nextWeekday(today, 5) },
    { label: 'Semaine prochaine', hint: 'lun.', icon: ICONS.arrowRight, date: nextWeekday(today, 0) },
  ];

  const free = h('input', { class: 'dp-free', placeholder: 'Taper une date : « vendredi 15h », « 12/11 »…' });
  const freePreview = h('div', { class: 'dp-free-preview' });
  free.addEventListener('input', () => {
    const p = parseQuickAdd(free.value, [], today);
    freePreview.textContent = p.date ? `${formatDay(p.date, today)}${p.time ? ` · ${p.time}` : ''}` : '';
  });
  free.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const p = parseQuickAdd(free.value, [], today);
    if (!p.date) return;
    if (p.time) time = p.time;
    pick(p.date);
  });

  const presetEls = presets.map((p) =>
    h(
      'button',
      { class: `dp-preset${current.date === p.date ? ' active' : ''}`, on: { click: () => pick(p.date) } },
      h('span', { class: 'menu-icon', html: p.icon }),
      h('span', { class: 'menu-label', text: p.label }),
      h('span', { class: 'menu-hint', text: p.hint }),
    ),
  );

  const cal = h('div', { class: 'dp-cal' });
  const renderCal = () => {
    clear(cal);
    const y = shown.getFullYear();
    const m = shown.getMonth();
    cal.append(
      h(
        'div',
        { class: 'dp-cal-head' },
        h('strong', { text: `${MONTHS[m]} ${y}` }),
        h(
          'div',
          { class: 'dp-cal-nav' },
          h('button', {
            class: 'icon-btn small',
            html: ICONS.chevronLeft,
            title: 'Mois précédent',
            on: {
              click: () => {
                shown = new Date(y, m - 1, 1, 12);
                renderCal();
              },
            },
          }),
          h('button', {
            class: 'icon-btn small',
            html: ICONS.chevronRight,
            title: 'Mois suivant',
            on: {
              click: () => {
                shown = new Date(y, m + 1, 1, 12);
                renderCal();
              },
            },
          }),
        ),
      ),
      h(
        'div',
        { class: 'dp-grid dp-weekdays' },
        ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { text: d })),
      ),
    );
    const grid = h('div', { class: 'dp-grid' });
    for (const week of monthGrid(y, m)) {
      for (const day of week) {
        const d = fromKey(day);
        const cls = [
          'dp-day',
          d.getMonth() !== m ? 'out' : '',
          day === today ? 'today' : '',
          day === current.date ? 'selected' : '',
          day < today ? 'past' : '',
        ]
          .filter(Boolean)
          .join(' ');
        grid.append(h('button', { class: cls, text: String(d.getDate()), on: { click: () => pick(day) } }));
      }
    }
    cal.append(grid);
  };
  renderCal();

  const timeInput = h('input', { class: 'dp-time', type: 'time', value: time ?? '' });
  timeInput.addEventListener('change', () => {
    time = timeInput.value || null;
    // Choisir une heure sans jour vise aujourd'hui.
    onPick({ date: current.date ?? today, time });
    current = { date: current.date ?? today, time };
  });

  const content = h(
    'div',
    { class: 'datepicker' },
    h('div', { class: 'dp-free-row' }, free, freePreview),
    h('div', { class: 'dp-presets' }, ...presetEls),
    cal,
    h(
      'div',
      { class: 'dp-foot' },
      h('label', { class: 'dp-time-label' }, h('span', { class: 'menu-icon', html: ICONS.clock }), timeInput),
      h('button', { class: 'btn btn-ghost', text: 'Sans date', on: { click: () => pick(null) } }),
    ),
  );

  openPopover(anchor, content, { className: 'popover-datepicker' });
  free.focus();
}
