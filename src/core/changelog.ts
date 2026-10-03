/**
 * Notes de version affichées dans « Nouveautés » — automatiquement au premier
 * lancement après une mise à jour, et à tout moment depuis les Réglages.
 * La plus récente en premier ; ajouter une entrée à chaque release.
 */
export interface ReleaseNote {
  version: string;
  date: string;
  items: string[];
}

export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.0',
    date: '2026-10-03',
    items: [
      'Vue Aujourd’hui avec avancement de la journée, charge estimée et heure de fin probable',
      'Saisie rapide en langage naturel : « Appeler Paul demain 14h !! #travail ~30m »',
      'Sous-tâches, notes, priorités, durées estimées et tâches récurrentes',
      'Glisser-déposer pour réordonner, changer de jour ou de liste',
      'Mode focus avec minuteur, rappels à l’heure prévue et suggestions pour planifier sa journée',
      'Palette de commandes (Ctrl+K), raccourcis clavier partout, annuler/rétablir',
      'Raccourci global Ctrl+Maj+Espace pour ajouter une tâche depuis n’importe où',
      'Mises à jour automatiques',
    ],
  },
];
