import { CHANGELOG } from '../core/changelog';
import { fromKey, MONTHS } from '../core/dates';
import { displayVersion, getFullVersion } from '../io/storage';
import { h } from './dom';
import { showModal } from './modal';
import { store } from './state';

function formatDate(key: string) {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function showWhatsNew() {
  const modal = showModal('Nouveautés', { subtitle: 'Ce qui a changé dans TaskHelper' });
  for (const note of CHANGELOG) {
    modal.body.append(
      h(
        'div',
        { class: 'release' },
        h(
          'div',
          { class: 'release-head' },
          h('strong', { text: `Version ${note.version}` }),
          h('span', { text: formatDate(note.date) }),
        ),
        h('ul', {}, ...note.items.map((item) => h('li', { text: item }))),
      ),
    );
  }
}

/**
 * Au premier lancement après une mise à jour, montre ce qui a changé. Une
 * première installation ne montre rien : tout est nouveau, l'app suffit.
 */
export async function maybeShowWhatsNew() {
  const version = displayVersion(await getFullVersion());
  const seen = store.settings.lastSeenVersion;
  store.setSettings({ lastSeenVersion: version });
  if (seen && seen !== version && CHANGELOG.some((n) => n.version === version)) showWhatsNew();
}
