import { h } from './dom';
import { showModal } from './modal';

const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'Partout',
    [
      ['N', 'Nouvelle tâche'],
      ['Ctrl+K', 'Rechercher, commandes'],
      ['Ctrl+1 … 4', 'Aujourd’hui, À venir, Toutes, Terminées'],
      ['Ctrl+5 … 9', 'Listes personnelles'],
      ['Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'],
      ['Ctrl+B', 'Afficher / masquer la barre latérale'],
      ['Ctrl+,', 'Réglages'],
      ['Ctrl+Maj+L', 'Thème clair / sombre'],
      ['Ctrl+Maj+Espace', 'Nouvelle tâche depuis n’importe où (Windows)'],
    ],
  ],
  [
    'Tâche sélectionnée',
    [
      ['↑ ↓', 'Naviguer'],
      ['Alt+↑ ↓', 'Déplacer'],
      ['Espace', 'Terminer'],
      ['Entrée', 'Ouvrir le détail'],
      ['F2', 'Renommer'],
      ['T / D / S', 'Aujourd’hui / demain / semaine prochaine'],
      ['U', 'Retirer la date'],
      ['1 / 2 / 3 / 0', 'Priorité haute / moyenne / basse / aucune'],
      ['F', 'Mode focus'],
      ['Ctrl+D', 'Dupliquer'],
      ['Suppr', 'Supprimer'],
    ],
  ],
  [
    'Saisie rapide',
    [
      ['demain 14h', 'Date et heure'],
      ['lundi, le 12, 15/10', 'Jour précis'],
      ['!!! / !! / !', 'Priorité haute / moyenne / basse'],
      ['#liste', 'Ranger dans une liste'],
      ['~30m, ~1h30', 'Durée estimée'],
      ['tous les lundis', 'Répétition'],
      ['Ctrl+Entrée', 'Ajouter et ouvrir le détail'],
    ],
  ],
  [
    'Mode focus',
    [
      ['Espace', 'Démarrer / pause'],
      ['Entrée', 'Terminer la tâche'],
      ['Échap', 'Quitter'],
    ],
  ],
];

export function openShortcuts() {
  const modal = showModal('Raccourcis clavier', { wide: true });
  modal.body.append(
    h(
      'div',
      { class: 'shortcut-grid' },
      ...GROUPS.map(([title, rows]) =>
        h(
          'div',
          { class: 'shortcut-group' },
          h('h3', { class: 'section-title', text: title }),
          ...rows.map(([keys, label]) =>
            h('div', { class: 'shortcut-row' }, h('kbd', { text: keys }), h('span', { text: label })),
          ),
        ),
      ),
    ),
  );
}
