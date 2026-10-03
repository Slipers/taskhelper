import { h } from './dom';
import { ICONS } from './icons';

export type MenuEntry =
  | {
      label: string;
      icon?: string;
      hint?: string;
      checked?: boolean;
      danger?: boolean;
      /** Pastille de couleur à la place de l'icône (listes). */
      color?: string;
      disabled?: boolean;
      run?: () => void;
      submenu?: MenuEntry[];
    }
  | { separator: true }
  | { header: string };

type Anchor = HTMLElement | { x: number; y: number };

interface Popover {
  el: HTMLElement;
  close: () => void;
}

const stack: Popover[] = [];

function closeFrom(index: number) {
  while (stack.length > index) stack.pop()!.close();
}

export function closeAllPopovers() {
  closeFrom(0);
}

export function hasOpenPopover() {
  return stack.length > 0;
}

function place(el: HTMLElement, anchor: Anchor, side: 'below' | 'right') {
  el.style.left = '0px';
  el.style.top = '0px';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x: number;
  let y: number;
  if (anchor instanceof HTMLElement) {
    const a = anchor.getBoundingClientRect();
    if (side === 'right') {
      x = a.right + 4;
      y = a.top - 5;
      if (x + r.width > vw - 8) x = a.left - r.width - 4;
    } else {
      x = a.left;
      y = a.bottom + 6;
      if (y + r.height > vh - 8) y = a.top - r.height - 6;
    }
  } else {
    x = anchor.x;
    y = anchor.y;
    if (y + r.height > vh - 8) y = anchor.y - r.height;
  }
  x = Math.max(8, Math.min(x, vw - r.width - 8));
  y = Math.max(8, Math.min(y, vh - r.height - 8));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/**
 * Ouvre un panneau flottant. `level` permet d'empiler un sous-menu sans
 * fermer son parent ; tout clic hors de la pile ferme l'ensemble.
 */
export function openPopover(
  anchor: Anchor,
  content: HTMLElement,
  options: { level?: number; side?: 'below' | 'right'; className?: string; onClose?: () => void } = {},
): Popover {
  const level = options.level ?? 0;
  closeFrom(level);
  const el = h('div', { class: `popover ${options.className ?? ''}`.trim() }, content);
  document.body.append(el);
  place(el, anchor, options.side ?? 'below');
  requestAnimationFrame(() => el.classList.add('popover-in'));

  const onDown = (e: PointerEvent) => {
    if (!stack.some((p) => p.el.contains(e.target as Node))) closeAllPopovers();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && stack[stack.length - 1] === pop) {
      e.stopPropagation();
      e.preventDefault();
      closeFrom(level);
    }
  };
  const onBlur = () => closeAllPopovers();

  const pop: Popover = {
    el,
    close: () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      el.remove();
      options.onClose?.();
    },
  };
  stack.push(pop);
  // Différé : sinon le clic qui vient d'ouvrir le panneau le referme aussitôt.
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
  }, 0);
  document.addEventListener('keydown', onKey, true);
  return pop;
}

export function openMenu(anchor: Anchor, entries: MenuEntry[], level = 0, side: 'below' | 'right' = 'below'): Popover {
  const items: HTMLButtonElement[] = [];
  const root = h('div', { class: 'menu', attrs: { role: 'menu' } });
  let pop: Popover;

  const focusItem = (i: number) => {
    if (!items.length) return;
    const n = (i + items.length) % items.length;
    items[n]!.focus();
  };

  for (const entry of entries) {
    if ('separator' in entry) {
      root.append(h('div', { class: 'menu-sep' }));
      continue;
    }
    if ('header' in entry) {
      root.append(h('div', { class: 'menu-header', text: entry.header }));
      continue;
    }
    const lead = entry.color
      ? h('span', { class: 'menu-dot', style: { background: entry.color } })
      : h('span', { class: 'menu-icon', html: entry.icon ?? '' });
    const btn = h(
      'button',
      {
        class: `menu-item${entry.danger ? ' danger' : ''}${entry.checked ? ' checked' : ''}`,
        disabled: entry.disabled,
        attrs: { role: 'menuitem' },
      },
      lead,
      h('span', { class: 'menu-label', text: entry.label }),
      entry.checked ? h('span', { class: 'menu-check', html: ICONS.check }) : null,
      entry.hint ? h('span', { class: 'menu-hint', text: entry.hint }) : null,
      entry.submenu ? h('span', { class: 'menu-sub', html: ICONS.chevronRight }) : null,
    );
    const openSub = () => {
      if (!entry.submenu) return;
      const sub = openMenu(btn, entry.submenu, level + 1, 'right');
      (sub.el.querySelector('.menu-item') as HTMLElement | null)?.focus();
    };
    btn.addEventListener('click', () => {
      if (entry.submenu) {
        openSub();
        return;
      }
      closeAllPopovers();
      entry.run?.();
    });
    btn.addEventListener('pointerenter', () => {
      btn.focus({ preventScroll: true });
      if (entry.submenu) openSub();
      else closeFrom(level + 1);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && entry.submenu) {
        e.preventDefault();
        openSub();
      }
    });
    items.push(btn);
    root.append(btn);
  }

  root.addEventListener('keydown', (e) => {
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(i - 1);
    } else if (e.key === 'ArrowLeft' && level > 0) {
      e.preventDefault();
      closeFrom(level);
    }
    e.stopPropagation();
  });

  pop = openPopover(anchor, root, { level, side });
  if (!(anchor instanceof HTMLElement) || level === 0) requestAnimationFrame(() => focusItem(0));
  return pop;
}
