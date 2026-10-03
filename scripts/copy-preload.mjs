import fs from 'node:fs';
import path from 'node:path';

// Fichiers du processus principal que tsc ne produit pas : le preload (CommonJS)
// et la source C# de la garde du mode concentration, compilée à l'exécution.
fs.mkdirSync('dist-electron', { recursive: true });
for (const file of ['preload.cjs', 'focus-guard.cs']) {
  fs.copyFileSync(path.join('electron', file), path.join('dist-electron', file));
}
console.log('preload.cjs et focus-guard.cs copiés vers dist-electron/');
