import { ICONS } from './icons';
import { h, iconButton } from './dom';

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close: () => void;
  /** Enregistre un nettoyage (désabonnements…) exécuté une fois à la fermeture. */
  onClose: (fn: () => void) => void;
}

let openModal: ModalHandle | null = null;

export function isModalOpen() {
  return openModal !== null;
}

export function showModal(
  title: string,
  options: { wide?: boolean; subtitle?: string; className?: string } = {},
): ModalHandle {
  openModal?.close();

  const body = h('div', { class: 'modal-body' });
  const closeBtn = iconButton(ICONS.close, 'Fermer', () => handle.close());
  const panel = h(
    'div',
    {
      class: ['modal', options.wide ? 'modal-wide' : '', options.className ?? ''].join(' ').trim(),
      attrs: { role: 'dialog', 'aria-label': title },
    },
    h(
      'header',
      { class: 'modal-head' },
      h(
        'div',
        {},
        h('h2', { text: title }),
        options.subtitle ? h('p', { class: 'modal-sub', text: options.subtitle }) : null,
      ),
      closeBtn,
    ),
    body,
  );

  const root = h('div', { class: 'modal-backdrop' }, panel);
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) handle.close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      handle.close();
    }
  };

  const cleanups: Array<() => void> = [];
  const previousFocus = document.activeElement as HTMLElement | null;

  const handle: ModalHandle = {
    root,
    body,
    close: () => {
      if (!root.isConnected) return;
      document.removeEventListener('keydown', onKey, true);
      root.classList.add('modal-leaving');
      setTimeout(() => root.remove(), 140);
      if (openModal === handle) openModal = null;
      for (const fn of cleanups) fn();
      cleanups.length = 0;
      previousFocus?.focus?.();
    },
    onClose: (fn) => cleanups.push(fn),
  };

  document.addEventListener('keydown', onKey, true);
  document.body.append(root);
  openModal = handle;
  return handle;
}

export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = 'Confirmer',
  danger = true,
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = showModal(title);
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(value);
    };
    const ok = h('button', {
      class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
      text: confirmLabel,
      on: { click: () => finish(true) },
    });
    modal.body.append(
      h('p', { class: 'modal-text', text: message }),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn', text: 'Annuler', on: { click: () => finish(false) } }),
        ok,
      ),
    );
    modal.onClose(() => finish(false));
    ok.focus();
  });
}

export function promptDialog(
  title: string,
  initial = '',
  confirmLabel = 'Valider',
  placeholder = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = showModal(title);
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(value);
    };
    const input = h('input', { class: 'text-input', value: initial, placeholder });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) finish(input.value.trim());
    });
    modal.body.append(
      input,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn', text: 'Annuler', on: { click: () => finish(null) } }),
        h('button', {
          class: 'btn btn-primary',
          text: confirmLabel,
          on: { click: () => input.value.trim() && finish(input.value.trim()) },
        }),
      ),
    );
    modal.onClose(() => finish(null));
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

/* ------------------------------------------------------------- toasts */

let toastHost: HTMLElement | null = null;

function host() {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', attrs: { 'aria-live': 'polite' } });
    document.body.append(toastHost);
  }
  return toastHost;
}

/** Notification éphémère en bas de l'écran, avec une action facultative (« Annuler »). */
export function toast(message: string, action?: { label: string; run: () => void }, duration = 4200) {
  const el = h('div', { class: 'toast' }, h('span', { text: message }));
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('toast-in');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.append(
      h('button', {
        class: 'toast-action',
        text: action.label,
        on: {
          click: () => {
            action.run();
            dismiss();
          },
        },
      }),
    );
  }
  // Un seul toast à la fois : le plus récent remplace le précédent.
  for (const old of Array.from(host().children)) old.remove();
  host().append(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  timer = window.setTimeout(dismiss, duration);
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => (timer = window.setTimeout(dismiss, 1800)));
}
