import type { AppSettings } from '../core/types';
import { ACCENTS } from '../core/types';
import {
  displayVersion,
  focusGuard,
  getFullVersion,
  isDesktop,
  openTextFile,
  pickAppExe,
  revealDataFolder,
  runningApps,
  sanitizeData,
  saveTextFile,
  updater,
} from '../io/storage';
import { clear, h } from './dom';
import { ICONS } from './icons';
import { openMenu } from './menu';
import { confirmDialog, showModal, toast } from './modal';
import { ensurePermission } from './reminders';
import { store } from './state';
import { showWhatsNew } from './whatsnew';

const REPO_URL = 'https://github.com/Slipers/taskhelper';

function section(title: string) {
  return h('h3', { class: 'section-title', text: title });
}

function switchRow(label: string, hint: string | null, key: keyof AppSettings, onChange?: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox' });
  input.checked = Boolean(store.settings[key]);
  input.addEventListener('change', () => {
    store.setSettings({ [key]: input.checked } as Partial<AppSettings>);
    onChange?.(input.checked);
  });
  return h(
    'label',
    { class: 'switch-row' },
    input,
    h('span', { class: 'switch' }),
    h(
      'span',
      {},
      h('span', { class: 'switch-label', text: label }),
      hint ? h('p', { class: 'field-hint', text: hint }) : null,
    ),
  );
}

function segmented<T extends string | number>(options: Array<[T, string]>, current: T, onPick: (v: T) => void) {
  const wrap = h('div', { class: 'segmented' });
  for (const [value, label] of options) {
    const b = h('button', {
      class: `seg-btn${value === current ? ' active' : ''}`,
      text: label,
      on: {
        click: () => {
          wrap.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          onPick(value);
        },
      },
    });
    wrap.append(b);
  }
  return wrap;
}

function rangeField(
  label: string,
  key: 'dayCapacity' | 'focusMinutes' | 'breakMinutes',
  min: number,
  max: number,
  step: number,
  unit: string,
  hint?: string,
) {
  const value = h('span', { class: 'field-value', text: `${store.settings[key]} ${unit}` });
  const input = h('input', { class: 'range', type: 'range', value: String(store.settings[key]) });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(store.settings[key]);
  input.addEventListener('input', () => {
    value.textContent = `${input.value} ${unit}`;
    store.setSettings({ [key]: Number(input.value) } as Partial<AppSettings>);
  });
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { text: label }), value),
    input,
    hint ? h('p', { class: 'field-hint', text: hint }) : null,
  );
}

function fieldRow(label: string, control: HTMLElement, hint?: string) {
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { text: label })),
    control,
    hint ? h('p', { class: 'field-hint', text: hint }) : null,
  );
}

async function exportData() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const path = await saveTextFile(`taskhelper-${stamp}.json`, JSON.stringify(store.data, null, 2), [
    { name: 'Sauvegarde TaskHelper', extensions: ['json'] },
  ]);
  if (path) toast('Sauvegarde exportée');
}

async function importData() {
  const text = await openTextFile([{ name: 'Sauvegarde TaskHelper', extensions: ['json'] }]);
  if (!text) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    toast('Fichier illisible : ce n’est pas une sauvegarde TaskHelper');
    return;
  }
  const data = sanitizeData(parsed);
  const ok = await confirmDialog(
    'Importer une sauvegarde',
    `Remplacer vos tâches actuelles par celles du fichier (${data.tasks.length} tâches, ${data.lists.length} listes) ? Ctrl+Z permet de revenir en arrière.`,
    'Remplacer',
  );
  if (!ok) return;
  store.replaceData(data);
  toast('Sauvegarde importée', { label: 'Annuler', run: () => store.undo() });
}

function updateBlock() {
  const status = h('span', { class: 'field-hint' });
  const btn = h('button', {
    class: 'btn small',
    text: 'Rechercher des mises à jour',
    on: {
      click: async () => {
        if (!updater) return;
        btn.disabled = true;
        status.textContent = 'Recherche…';
        const res = await updater.check();
        btn.disabled = false;
        status.textContent =
          res.status === 'available'
            ? `Version ${displayVersion(res.version)} disponible — voir la carte en haut à droite.`
            : res.status === 'none'
              ? 'Vous avez la dernière version.'
              : res.status === 'disabled'
                ? 'Mises à jour automatiques réservées à la version installée.'
                : `Échec : ${res.message}`;
      },
    },
  });
  if (!updater) {
    btn.disabled = true;
    status.textContent = 'Indisponible dans le navigateur.';
  }
  return h('div', { class: 'update-row' }, btn, status);
}

const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** Applications qui restent utilisables pendant la concentration. */
function allowedAppsField() {
  const chips = h('div', { class: 'app-chips' });
  const has = (name: string) => store.settings.allowedApps.some((a) => a.toLowerCase() === name.toLowerCase());
  const add = (name: string) => {
    if (!name || has(name)) return;
    store.setSettings({ allowedApps: [...store.settings.allowedApps, name] });
    paint();
  };
  const paint = () => {
    clear(chips);
    if (!store.settings.allowedApps.length)
      chips.append(h('span', { class: 'field-hint', text: 'Aucune : seul TaskHelper reste ouvert.' }));
    for (const name of store.settings.allowedApps) {
      chips.append(
        h(
          'span',
          { class: 'app-chip' },
          h('span', { text: capitalize(name) }),
          h('button', {
            class: 'app-chip-del',
            html: ICONS.close,
            title: `Ne plus autoriser ${capitalize(name)}`,
            on: {
              click: () => {
                store.setSettings({ allowedApps: store.settings.allowedApps.filter((a) => a !== name) });
                paint();
              },
            },
          }),
        ),
      );
    }
  };
  paint();

  const openBtn = h('button', {
    class: 'btn small',
    html: `${ICONS.plus}<span>Application ouverte…</span>`,
    on: {
      click: async () => {
        openBtn.disabled = true;
        const apps = await runningApps();
        openBtn.disabled = false;
        const candidates = apps.filter((a) => !has(a.name));
        if (!candidates.length) {
          toast('Aucune autre application ouverte à autoriser');
          return;
        }
        openMenu(
          openBtn,
          candidates.map((a) => ({
            label: a.label === a.name ? capitalize(a.name) : `${a.label} (${a.name})`,
            run: () => add(a.name),
          })),
        );
      },
    },
  });

  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { text: 'Applications autorisées' })),
    chips,
    h(
      'div',
      { class: 'button-row' },
      openBtn,
      h('button', {
        class: 'btn small',
        html: `${ICONS.folder}<span>Parcourir…</span>`,
        on: {
          click: async () => {
            const app = await pickAppExe();
            if (app) add(app.name);
          },
        },
      }),
    ),
    h('p', {
      class: 'field-hint',
      text: 'La barre des tâches, le menu Démarrer et le Gestionnaire des tâches restent toujours accessibles.',
    }),
  );
}

export function openSettings() {
  const modal = showModal('Réglages', { subtitle: 'Tout est enregistré automatiquement.' });
  const s = store.settings;

  const accents = h('div', { class: 'swatches' });
  const paintAccents = () => {
    clear(accents);
    for (const c of ACCENTS) {
      accents.append(
        h('button', {
          class: `swatch${store.settings.accent === c ? ' active' : ''}`,
          style: { background: c },
          title: c,
          on: {
            click: () => {
              store.setSettings({ accent: c });
              paintAccents();
            },
          },
        }),
      );
    }
  };
  paintAccents();

  const versionLine = h('p', { class: 'settings-version', text: '' });
  void getFullVersion().then((v) => (versionLine.textContent = `TaskHelper ${displayVersion(v)}`));

  modal.body.append(
    section('Apparence'),
    fieldRow(
      'Thème',
      segmented<AppSettings['theme']>(
        [
          ['system', 'Système'],
          ['light', 'Clair'],
          ['dark', 'Sombre'],
        ],
        s.theme,
        (v) => store.setSettings({ theme: v }),
      ),
    ),
    fieldRow('Couleur d’accent', accents),

    section('Journée'),
    rangeField(
      'Temps disponible par jour',
      'dayCapacity',
      1,
      14,
      0.5,
      'h',
      'Sert à la jauge de charge de la vue Aujourd’hui : au-delà, la journée est trop remplie.',
    ),
    switchRow('Rappels', 'Une notification Windows à l’heure prévue d’une tâche.', 'reminders', (v) => {
      if (v) void ensurePermission();
    }),
    fieldRow(
      'Prévenir',
      segmented<number>(
        [
          [0, 'À l’heure'],
          [5, '5 min avant'],
          [10, '10 min'],
          [15, '15 min'],
          [30, '30 min'],
        ],
        s.reminderLead,
        (v) => store.setSettings({ reminderLead: v }),
      ),
    ),
    switchRow('Sons', 'Petit son quand on coche une tâche et à la fin d’une session de focus.', 'sounds'),

    section('Mode focus'),
    rangeField('Session de concentration', 'focusMinutes', 5, 90, 5, 'min'),
    rangeField('Pause', 'breakMinutes', 1, 30, 1, 'min'),
    ...(focusGuard
      ? [
          switchRow(
            'Bloquer les autres applications',
            'Pendant la concentration, toute autre application est réduite dès qu’elle s’ouvre et TaskHelper revient devant. Les fenêtres sont rouvertes en quittant le mode focus.',
            'blockApps',
          ),
          allowedAppsField(),
        ]
      : []),

    ...(isDesktop
      ? [
          section('Windows'),
          switchRow(
            'Raccourci global Ctrl+Maj+Espace',
            'Ajoute une tâche depuis n’importe quelle application.',
            'globalShortcut',
          ),
          switchRow(
            'Garder dans la zone de notification',
            'Fermer la fenêtre la réduit près de l’horloge : les rappels continuent d’arriver.',
            'closeToTray',
          ),
          switchRow(
            'Lancer au démarrage de Windows',
            'Démarre discrètement si l’option ci-dessus est active.',
            'launchAtLogin',
          ),
        ]
      : []),

    section('Données'),
    h('p', {
      class: 'field-hint',
      text: 'Vos tâches restent sur cet ordinateur. Une copie de sauvegarde est faite chaque jour (14 jours conservés).',
    }),
    h(
      'div',
      { class: 'button-row' },
      h('button', {
        class: 'btn small',
        html: `${ICONS.download}<span>Exporter</span>`,
        on: { click: () => void exportData() },
      }),
      h('button', {
        class: 'btn small',
        html: `${ICONS.upload}<span>Importer</span>`,
        on: { click: () => void importData() },
      }),
      isDesktop
        ? h('button', {
            class: 'btn small',
            html: `${ICONS.folder}<span>Ouvrir le dossier</span>`,
            on: { click: () => void revealDataFolder() },
          })
        : null,
    ),

    section('À propos'),
    updateBlock(),
    h(
      'div',
      { class: 'button-row' },
      h('button', {
        class: 'btn small',
        html: `${ICONS.sparkles}<span>Nouveautés</span>`,
        on: {
          click: () => {
            modal.close();
            showWhatsNew();
          },
        },
      }),
      h('a', {
        class: 'btn small',
        text: 'Code source sur GitHub',
        attrs: { href: REPO_URL, target: '_blank', rel: 'noreferrer' },
      }),
    ),
    versionLine,
  );
}
