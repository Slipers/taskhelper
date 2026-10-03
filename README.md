<div align="center">

<img src="assets/icon.png" width="96" alt="Icône TaskHelper">

# TaskHelper

Organiser sa journée simplement : une liste de tâches rapide, au clavier comme à la souris, qui aide à décider quoi faire aujourd'hui, et à le faire.

[**⬇ Télécharger pour Windows**](https://github.com/Slipers/taskhelper/releases/latest/download/TaskHelper-Setup.exe) · [Releases](https://github.com/Slipers/taskhelper/releases)

</div>

## Ce que ça fait

TaskHelper est une application Windows native (Electron) pour gérer ses tâches du jour, dans l'esprit de Google Tasks : on ouvre, on tape, c'est rangé. Elle va plus loin sur ce qui fait gagner du temps au quotidien : une saisie qui comprend « demain 14h », une vue Aujourd'hui qui dit à quelle heure la journée sera bouclée, un mode focus et des rappels. Aucun compte, aucun cloud : tout reste dans un fichier JSON sur votre disque, sauvegardé automatiquement.

## Pourquoi pas Google Tasks ?

Google Tasks est volontairement minimal : pas de priorité, pas de durée, pas de vue de la journée, et une saisie qui demande trois clics pour poser une date. TaskHelper garde la même simplicité à l'écran, mais chaque geste fréquent prend une touche ou une phrase.

## Fonctionnalités

- ⚡ **Saisie rapide en langage naturel** : `Appeler Paul demain 14h !! #travail ~30m` crée la tâche « Appeler Paul », demain à 14:00, priorité moyenne, dans la liste Travail, estimée à 30 minutes. Un aperçu sous le champ montre ce qui a été compris avant de valider
- ☀️ **Vue Aujourd'hui** : avancement de la journée, temps restant estimé, **heure de fin probable**, jauge de charge face au temps dont vous disposez, et les tâches en retard qu'un clic reporte à aujourd'hui
- ✨ **Planifier ma journée** : les tâches sans date ou prévues demain, les plus prioritaires d'abord, à ajouter à la journée d'un clic
- 📅 **À venir** : les sept prochains jours d'un coup d'œil, avec glisser-déposer d'un jour à l'autre
- ✅ **Sous-tâches, notes, priorités, durées estimées**, et **tâches récurrentes** (tous les jours, en semaine, toutes les semaines, tous les mois…)
- 🖱️ **Glisser-déposer** pour réordonner, changer de jour, de liste, ou terminer en déposant sur « Terminées »
- 🎯 **Mode focus** : une seule tâche à l'écran, un minuteur de concentration avec pauses, et l'enchaînement direct vers la tâche suivante
- 🔔 **Rappels** : une notification Windows à l'heure prévue, ou quelques minutes avant
- 🔍 **Palette de commandes** (Ctrl+K) : chercher une tâche, aller à une liste, lancer une action, ou créer une tâche directement
- ⌨️ **Tout au clavier** : N pour ajouter, flèches pour naviguer, Espace pour terminer, T/D/S pour planifier, 1/2/3 pour la priorité… (F1 pour la liste complète)
- ↩️ **Annuler / rétablir** partout (Ctrl+Z / Ctrl+Y), et un bouton « Annuler » après chaque suppression ou tâche terminée
- 🪟 **Intégré à Windows** : raccourci global Ctrl+Maj+Espace pour ajouter une tâche depuis n'importe quelle application, pastille du nombre de tâches du jour sur l'icône de la barre des tâches, zone de notification et lancement au démarrage (optionnels)
- 🎨 **Thème clair / sombre** (ou celui de Windows) et couleur d'accent au choix
- 💾 **Local-first** : un fichier JSON, une sauvegarde automatique par jour (14 jours conservés), export / import
- 🔄 **Mises à jour automatiques** : détection, téléchargement et installation en un clic, puis « Nouveautés » au redémarrage

## Pour commencer

1. [Téléchargez `TaskHelper-Setup.exe`](https://github.com/Slipers/taskhelper/releases/latest/download/TaskHelper-Setup.exe) et lancez-le. Aucun droit administrateur n'est requis, et la désinstallation est propre.
2. Tapez votre première tâche dans le champ en haut de la vue Aujourd'hui, puis Entrée.
3. Ouvrez ⚙ **Réglages** pour indiquer le temps dont vous disposez par jour, activer la zone de notification ou le lancement au démarrage.

Vos tâches sont enregistrées dans `%APPDATA%\TaskHelper\data.json`, et les sauvegardes quotidiennes dans `%APPDATA%\TaskHelper\backups\`.

## Saisie rapide

| Vous tapez | Résultat |
| --- | --- |
| `aujourd'hui`, `demain`, `après-demain`, `ce soir` | Jour relatif (`ce soir` pose aussi 19:00) |
| `lundi`, `vendredi prochain`, `ce week-end`, `semaine prochaine` | Prochain jour correspondant |
| `le 12`, `15/10`, `3 novembre`, `dans 3 jours` | Date précise |
| `14h`, `9h30`, `18:45`, `midi` | Heure (aujourd'hui si aucun jour n'est donné) |
| `!!!` `!!` `!` ou `!1` `!2` `!3` | Priorité haute / moyenne / basse |
| `#travail` | Liste (le début du nom suffit) |
| `~30m`, `~1h30` | Durée estimée |
| `tous les jours`, `en semaine`, `tous les mardis`, `chaque mois` | Répétition |

Ctrl+Entrée ajoute la tâche et ouvre directement son détail.

## Comment ça marche

L'interface est écrite en TypeScript sans framework, avec un store unique qui prend un instantané à chaque modification (toute action est donc annulable) et enregistre de façon différée, puis de façon synchrone à la fermeture. Les écritures sur disque sont atomiques (fichier temporaire puis renommage) : un arrêt brutal ne peut pas corrompre les tâches. Les lignes de la liste se réordonnent avec une animation FLIP, pour que rien ne « saute » à l'écran.

## Prérequis

- Windows 10/11

## Développement

```bash
npm install
npm run dev
```

```bash
npm test
```

### Reconstruire l'exécutable et l'installeur

```bash
npm run dist
```

Produit `release/TaskHelper-Setup.exe` (installeur NSIS) et `release/TaskHelper-Portable.exe` (aucune installation requise).

L'icône est générée par `node scripts/make-icon.mjs`.

## Mises à jour automatiques

L'app vérifie au démarrage, puis toutes les 30 minutes, si une nouvelle version est publiée sur ce dépôt ([electron-updater](https://github.com/electron-userland/electron-builder)) et affiche une carte « Mise à jour disponible » avec un bouton **Installer** : téléchargement avec barre de progression, puis redémarrage automatique. Réglages → À propos permet aussi de lancer la vérification à la main. Ne s'applique qu'à la version installée via `TaskHelper-Setup.exe` : l'exécutable portable n'a pas d'emplacement fixe où appliquer une mise à jour en place, il ne vérifie donc rien.

**Publier une mise à jour** (depuis une machine authentifiée avec `gh auth login`, scope `repo`) :

```bash
# 1. Monter le numéro de version dans package.json, ex. "1.1.0"
# 2. Ajouter une entrée en tête de src/core/changelog.ts (affichée dans « Nouveautés »)
# 3. Construire et publier en une commande :
GH_TOKEN=$(gh auth token) npm run release
```

`electron-builder` construit l'installeur, génère les métadonnées de mise à jour (`latest.yml`) et publie le tout comme release GitHub. Les applications déjà installées détectent la nouvelle version dans la demi-heure.

## Licence

[MIT](LICENSE)
