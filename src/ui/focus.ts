import { formatDuration } from '../core/dates';
import type { ID, Task } from '../core/types';
import { buildView } from '../core/views';
import { toggleComplete } from './actions';
import { clear, h, iconButton } from './dom';
import { ICONS } from './icons';
import { focusGuard } from '../io/storage';
import { confirmDialog, isModalOpen, toast } from './modal';
import { notify } from './reminders';
import { playSound } from './sound';
import { store } from './state';
import { checkButton } from './taskrow';

type Phase = 'focus' | 'break';

/**
 * Mode focus : une seule tâche à l'écran, un minuteur de concentration
 * (type Pomodoro) et l'enchaînement direct vers la tâche suivante du jour.
 */
let root: HTMLElement | null = null;
let taskId: ID | null = null;
let phase: Phase = 'focus';
let remaining = 0;
let running = false;
let endsAt = 0;
let timer = 0;
let sessions = 0;
let baseTitle = document.title;
/** La garde a-t-elle réduit des fenêtres pendant cette séance ? Elles seront rouvertes à la sortie. */
let guardUsed = false;
let guardActive = false;

/* ------------------------------------------------- blocage des applications */

function guardWanted() {
  return Boolean(focusGuard) && store.settings.blockApps && root !== null && running && phase === 'focus';
}

/**
 * Concentration en cours = les autres applications sont réduites dès qu'elles
 * apparaissent. En pause (minuteur arrêté ou pause entre deux sessions), on
 * laisse faire ; les fenêtres reviennent toutes en quittant le mode focus.
 */
export function syncFocusGuard() {
  if (!focusGuard) return;
  const active = guardWanted();
  if (active) guardUsed = true;
  if (active || guardActive) focusGuard.update({ active, allowed: store.settings.allowedApps });
  guardActive = active;
  root?.querySelector('.focus-lock')?.classList.toggle('on', active);
}

function appLabel(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

let lastBlockToast = { name: '', at: 0 };
focusGuard?.onBlocked(({ name }) => {
  const now = Date.now();
  if (lastBlockToast.name === name && now - lastBlockToast.at < 4000) return;
  lastBlockToast = { name, at: now };
  toast(`${appLabel(name)} est bloqué pendant la concentration`);
});
focusGuard?.onError((message) => {
  toast(`Blocage des applications indisponible : ${message}`, undefined, 7000);
});

function queue(): Task[] {
  // Les tâches du jour, dans l'ordre où l'utilisateur les a rangées.
  const model = buildView('today', store.data, store.settings.sort.today ?? 'manual');
  return model.sections.filter((s) => !s.done).flatMap((s) => s.tasks);
}

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function phaseLength(p: Phase) {
  return (p === 'focus' ? store.settings.focusMinutes : store.settings.breakMinutes) * 60;
}

function tick() {
  if (!running) return;
  remaining = (endsAt - Date.now()) / 1000;
  if (remaining <= 0) {
    finishPhase();
    return;
  }
  updateClock();
}

function finishPhase() {
  running = false;
  clearInterval(timer);
  if (store.settings.sounds) playSound('chime');
  if (phase === 'focus') {
    sessions++;
    notify('Session terminée', `Bravo ! Prenez ${store.settings.breakMinutes} min de pause.`);
    phase = 'break';
  } else {
    notify('Pause terminée', 'On s’y remet ?');
    phase = 'focus';
  }
  remaining = phaseLength(phase);
  render();
  syncFocusGuard();
}

function start() {
  running = true;
  endsAt = Date.now() + remaining * 1000;
  clearInterval(timer);
  timer = window.setInterval(tick, 250);
  render();
  syncFocusGuard();
}

function pause() {
  running = false;
  clearInterval(timer);
  remaining = (endsAt - Date.now()) / 1000;
  render();
  syncFocusGuard();
}

function updateClock() {
  if (!root) return;
  const total = phaseLength(phase);
  const clock = root.querySelector<HTMLElement>('.focus-clock-text');
  const arc = root.querySelector<SVGCircleElement>('.focus-arc');
  if (clock) clock.textContent = fmt(remaining);
  if (arc) {
    const c = Number(arc.dataset.c);
    arc.style.strokeDashoffset = String(c * (1 - remaining / total));
  }
  const t = store.task(taskId);
  document.title = running ? `${fmt(remaining)} · ${phase === 'focus' ? (t?.title ?? 'Focus') : 'Pause'}` : baseTitle;
}

function nextTask(skipCurrent: boolean) {
  const q = queue().filter((t) => !skipCurrent || t.id !== taskId);
  const t = q[0];
  if (!t) {
    taskId = null;
    render();
    return;
  }
  taskId = t.id;
  render();
}

function completeCurrent() {
  if (!taskId) return;
  const id = taskId;
  toggleComplete(id);
  // On laisse l'animation de la case se jouer avant de passer à la suite.
  setTimeout(() => nextTask(true), 420);
}

function render() {
  if (!root) return;
  const body = root.querySelector<HTMLElement>('.focus-body')!;
  clear(body);
  const t = store.task(taskId);
  const r = 108;
  const c = 2 * Math.PI * r;
  const total = phaseLength(phase);

  if (!t || t.done) {
    body.append(
      h(
        'div',
        { class: 'focus-empty' },
        h('div', { class: 'empty-icon', html: ICONS.checkCircle }),
        h('h2', { text: queue().length ? 'Choisissez une tâche' : 'Plus rien pour aujourd’hui' }),
        h('p', {
          text: queue().length
            ? 'Sélectionnez la prochaine tâche à attaquer.'
            : 'Toutes les tâches du jour sont faites. Bien joué !',
        }),
        ...queue()
          .slice(0, 6)
          .map((q) =>
            h('button', {
              class: 'focus-pick',
              text: q.title,
              on: {
                click: () => {
                  taskId = q.id;
                  render();
                },
              },
            }),
          ),
      ),
    );
    updateClock();
    return;
  }

  const list = store.list(t.listId);
  const upcoming = queue().filter((q) => q.id !== t.id);
  const subtasks = h(
    'div',
    { class: 'focus-subtasks' },
    ...t.subtasks.map((s) =>
      h(
        'div',
        { class: `subtask${s.done ? ' done' : ''}` },
        checkButton(s.done, 0, () => {
          store.updateSubtask(t.id, s.id, { done: !s.done });
          render();
        }),
        h('span', { text: s.title }),
      ),
    ),
  );

  const parts: Array<HTMLElement | null> = [
    h(
      'div',
      { class: 'focus-task' },
      h(
        'div',
        { class: 'focus-list' },
        h('i', { style: { background: list?.color ?? 'var(--muted)' } }),
        h('span', { text: list?.name ?? '' }),
        t.estimate ? h('span', { class: 'focus-est', text: `· estimé ${formatDuration(t.estimate)}` }) : null,
      ),
      h('h2', { class: 'focus-title', text: t.title }),
      t.notes.trim() ? h('p', { class: 'focus-notes', text: t.notes }) : null,
      t.subtasks.length ? subtasks : null,
    ),
    h(
      'div',
      { class: `focus-clock ${phase}${running ? ' running' : ''}` },
      h('div', {
        class: 'focus-ring',
        html: `<svg viewBox="0 0 240 240" width="240" height="240"><circle cx="120" cy="120" r="${r}" class="focus-track"/><circle cx="120" cy="120" r="${r}" class="focus-arc" data-c="${c}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - remaining / total)}"/></svg>`,
      }),
      h(
        'div',
        { class: 'focus-clock-inner' },
        h('span', { class: 'focus-phase', text: phase === 'focus' ? 'Concentration' : 'Pause' }),
        h('span', { class: 'focus-clock-text', text: fmt(remaining) }),
        h('span', { class: 'focus-sessions', text: sessions ? `${sessions} session${sessions > 1 ? 's' : ''}` : ' ' }),
      ),
    ),
    h(
      'div',
      { class: 'focus-controls' },
      iconButton(
        ICONS.reset,
        'Recommencer',
        () => {
          pause();
          remaining = phaseLength(phase);
          render();
        },
        'round',
      ),
      h('button', {
        class: 'focus-play',
        html: running ? ICONS.pause : ICONS.play,
        title: running ? 'Pause (Espace)' : 'Démarrer (Espace)',
        on: { click: () => (running ? pause() : start()) },
      }),
      iconButton(
        ICONS.skip,
        phase === 'focus' ? 'Passer à la pause' : 'Passer la pause',
        () => {
          pause();
          phase = phase === 'focus' ? 'break' : 'focus';
          remaining = phaseLength(phase);
          render();
        },
        'round',
      ),
    ),
    h(
      'div',
      { class: 'focus-actions' },
      h('button', {
        class: 'btn btn-primary',
        html: `${ICONS.check}<span>Terminer la tâche</span>`,
        on: { click: completeCurrent },
      }),
      upcoming.length
        ? h('button', {
            class: 'btn',
            html: `<span>Tâche suivante</span>${ICONS.arrowRight}`,
            on: { click: () => nextTask(true) },
          })
        : null,
    ),
    upcoming.length ? h('p', { class: 'focus-next', text: `Ensuite : ${upcoming[0]!.title}` }) : null,
    focusGuard && store.settings.blockApps && phase === 'focus' && !running
      ? h('p', { class: 'focus-guard-hint', html: `${ICONS.lock}<span>${guardHint()}</span>` })
      : null,
  ];
  body.append(...parts.filter((x): x is HTMLElement => x !== null));
  updateClock();
}

function guardHint() {
  const allowed = store.settings.allowedApps.map(appLabel);
  const tail = allowed.length ? ` Autorisé : ${allowed.join(', ')}.` : '';
  return `Au démarrage, toutes les autres applications seront réduites jusqu’à la pause.${tail}`;
}

function onKey(e: KeyboardEvent) {
  if (!root || isModalOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    void requestClose();
  } else if (e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    if (running) pause();
    else start();
  } else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
    e.preventDefault();
    e.stopPropagation();
    completeCurrent();
  }
}

export function isFocusOpen() {
  return root !== null;
}

export function openFocus(id: ID | null) {
  const candidate = store.task(id);
  taskId = candidate && !candidate.done ? candidate.id : (queue()[0]?.id ?? null);
  if (!taskId && !queue().length) {
    toast('Aucune tâche à faire aujourd’hui pour le mode focus');
    return;
  }
  if (root) {
    render();
    return;
  }
  baseTitle = document.title;
  guardUsed = false;
  phase = 'focus';
  remaining = phaseLength('focus');
  running = false;
  root = h(
    'div',
    { class: 'focus-overlay', attrs: { role: 'dialog', 'aria-label': 'Mode focus' } },
    h(
      'div',
      { class: 'focus-top' },
      h('span', { class: 'focus-brand', html: `${ICONS.target}<span>Mode focus</span>` }),
      h('span', { class: 'focus-lock', html: `${ICONS.lock}<span>Applications bloquées</span>` }),
      iconButton(ICONS.close, 'Quitter le mode focus (Échap)', () => void requestClose()),
    ),
    h('div', { class: 'focus-body' }),
  );
  document.body.append(root);
  requestAnimationFrame(() => root?.classList.add('open'));
  document.addEventListener('keydown', onKey, true);
  render();
}

/** Quitter pendant une concentration qui bloque les applications demande confirmation. */
async function requestClose() {
  if (guardActive) {
    const ok = await confirmDialog(
      'Arrêter la concentration ?',
      'Le minuteur s’arrête et vos applications sont rouvertes.',
      'Arrêter',
    );
    if (!ok) return;
  }
  closeFocus();
}

export function closeFocus() {
  if (!root) return;
  if (running) toast('Minuteur arrêté');
  running = false;
  clearInterval(timer);
  syncFocusGuard();
  if (guardUsed) focusGuard?.end();
  guardUsed = false;
  document.removeEventListener('keydown', onKey, true);
  const el = root;
  root = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 200);
  document.title = baseTitle;
}

/** Les données changent pendant le focus (annulation, autre fenêtre…) : on se remet à jour. */
export function refreshFocus() {
  if (root && !running) render();
}
