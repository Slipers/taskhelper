import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  nativeImage,
  Menu,
  Tray,
  globalShortcut,
  screen,
} from 'electron';
import electronUpdaterPkg from 'electron-updater';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// electron-updater est un module CommonJS ; Node ne parvient pas à en dériver
// statiquement l'export nommé `autoUpdater` sous ESM, il faut passer par le
// défaut puis déstructurer à l'exécution.
const { autoUpdater } = electronUpdaterPkg;
const DEV_URL = process.env.TASKHELPER_DEV_URL;
const APP_ID = 'fr.pasca.taskhelper';
const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+Space';

const userDir = () => app.getPath('userData');
const dataFile = () => path.join(userDir(), 'data.json');
const backupsDir = () => path.join(userDir(), 'backups');
const settingsFile = () => path.join(userDir(), 'settings.json');
const windowStateFile = () => path.join(userDir(), 'window-state.json');

const iconPath = () =>
  app.isPackaged
    ? path.join(__dirname, '..', 'dist', 'icon.png')
    : path.join(__dirname, '..', 'src', 'public', 'icon.png');

interface DesktopPrefs {
  closeToTray: boolean;
  launchAtLogin: boolean;
  globalShortcut: boolean;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let prefs: DesktopPrefs = { closeToTray: false, launchAtLogin: false, globalShortcut: true };

/* -------------------------------------------------------------- fichiers */

/** Écriture atomique : un crash pendant l'enregistrement ne doit jamais détruire les tâches. */
function writeAtomicSync(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, file);
}

async function writeAtomic(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

function readJsonSync<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

const BACKUPS_KEPT = 14;

/** Une copie du fichier de tâches par jour d'utilisation, les 14 dernières conservées. */
async function dailyBackup() {
  if (!existsSync(dataFile())) return;
  await fs.mkdir(backupsDir(), { recursive: true });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const target = path.join(backupsDir(), `data-${stamp}.json`);
  if (!existsSync(target)) await fs.copyFile(dataFile(), target);
  const all = (await fs.readdir(backupsDir())).filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) {
    await fs.unlink(path.join(backupsDir(), old)).catch(() => {});
  }
}

/* --------------------------------------------------------------- fenêtre */

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function loadWindowState(): WindowState {
  const saved = readJsonSync<WindowState>(windowStateFile());
  const fallback: WindowState = { width: 1180, height: 780 };
  if (!saved || !saved.width || !saved.height) return fallback;
  // Un écran débranché depuis la dernière session ne doit pas laisser la fenêtre hors de vue.
  if (saved.x !== undefined && saved.y !== undefined) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return (
        saved.x! < a.x + a.width - 80 &&
        saved.x! + saved.width > a.x + 80 &&
        saved.y! >= a.y - 10 &&
        saved.y! < a.y + a.height - 60
      );
    });
    if (!visible) return { width: saved.width, height: saved.height, maximized: saved.maximized };
  }
  return saved;
}

function saveWindowState(win: BrowserWindow) {
  const b = win.getNormalBounds();
  try {
    writeAtomicSync(windowStateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    /* sans importance */
  }
}

const OVERLAY_DARK = { color: '#16171b', symbolColor: '#c9ccd4', height: 40 };
const OVERLAY_LIGHT = { color: '#f6f7f9', symbolColor: '#3a3d45', height: 40 };

function createWindow(startHidden = false) {
  const state = loadWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 420,
    minHeight: 480,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101114' : '#f1f2f5',
    icon: iconPath(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: nativeTheme.shouldUseDarkColors ? OVERLAY_DARK : OVERLAY_LIGHT,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  // maximize() afficherait la fenêtre : on attend qu'elle doive vraiment apparaître.
  let restoreMaximized = Boolean(state.maximized);
  const reveal = () => {
    if (restoreMaximized) win.maximize();
    restoreMaximized = false;
    win.show();
  };
  win.once('ready-to-show', () => {
    if (!startHidden) reveal();
  });
  win.once('show', () => {
    if (restoreMaximized) {
      restoreMaximized = false;
      win.maximize();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('close', (e) => {
    saveWindowState(win);
    if (prefs.closeToTray && !quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendCommand(command: string) {
  mainWindow?.webContents.send('app:command', command);
}

function buildMenu() {
  // Barre de menus masquée (barre de titre personnalisée) : elle ne sert qu'à
  // porter les raccourcis système d'édition et les outils de développement.
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Édition',
      submenu: [
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Plein écran', role: 'togglefullscreen', accelerator: 'F11' },
        { label: 'Outils de développement', role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------------------------------------------- barre des tâches */

function applyPrefs(next: DesktopPrefs) {
  prefs = next;

  if (prefs.closeToTray && !tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }));
    tray.setToolTip('TaskHelper');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir TaskHelper', click: showWindow },
        {
          label: 'Nouvelle tâche',
          click: () => {
            showWindow();
            sendCommand('quickadd');
          },
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', showWindow);
  } else if (!prefs.closeToTray && tray) {
    tray.destroy();
    tray = null;
  }

  // En dev, on enregistrerait electron.exe au démarrage de Windows : rien à faire.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: prefs.launchAtLogin, args: ['--hidden'] });
  }

  globalShortcut.unregister(QUICK_ADD_SHORTCUT);
  if (prefs.globalShortcut) {
    globalShortcut.register(QUICK_ADD_SHORTCUT, () => {
      showWindow();
      sendCommand('quickadd');
    });
  }
}

/* ------------------------------------------------------------- auto-update */

/** Cet exécutable a-t-il été lancé depuis l'exécutable portable ? */
function isPortableBuild(): boolean {
  // electron-builder pose cette variable d'environnement uniquement quand le
  // process a démarré depuis l'exe portable, quelle que soit sa position sur
  // le disque — c'est la seule façon fiable de le distinguer d'une installation.
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
let updaterEnabled = false;
// Un nouveau sondage pendant qu'un téléchargement est en cours (ou prêt)
// ne doit ni l'interrompre ni faire clignoter la carte côté renderer.
let updateInFlight = false;

/**
 * L'utilisateur choisit quand télécharger (carte « Installer »), pas
 * electron-updater tout seul en tâche de fond — on désactive donc le
 * téléchargement automatique et on pilote chaque étape depuis le renderer.
 *
 * Ne s'applique qu'à l'installation NSIS : l'exécutable portable n'a pas
 * d'emplacement fixe où electron-updater puisse remplacer les fichiers en place.
 */
function setupAutoUpdater() {
  updaterEnabled = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const send = (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args);

  autoUpdater.on('update-available', (info) => {
    updateInFlight = true;
    send('updater:available', {
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    });
  });
  autoUpdater.on('download-progress', (p) => {
    send('updater:progress', {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send('updater:ready', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    send('updater:error', err.message);
  });

  const check = () => {
    if (updateInFlight) return;
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Vérification de mise à jour impossible :', err);
    });
  };

  // Différé pour ne jamais retarder l'affichage de la fenêtre au démarrage ;
  // une absence de réseau ne doit provoquer ni popup ni blocage. Puis un
  // sondage périodique : l'app reste souvent ouverte toute la journée.
  setTimeout(check, 2500);
  setInterval(check, RECHECK_INTERVAL_MS);
}

ipcMain.handle('updater:check', async () => {
  if (!updaterEnabled) return { status: 'disabled' };
  try {
    const res = await autoUpdater.checkForUpdates();
    if (res?.isUpdateAvailable) return { status: 'available', version: res.updateInfo.version };
    return { status: 'none' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('updater:download', async () => {
  await autoUpdater.downloadUpdate();
});
ipcMain.handle('updater:install', () => {
  quitting = true;
  autoUpdater.quitAndInstall();
});

/* ------------------------------------------------------------------ IPC */

ipcMain.handle('data:read', async () => {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch (err) {
    // Fichier absent = première ouverture. Fichier illisible = on le met de
    // côté plutôt que de l'écraser au prochain enregistrement.
    if (existsSync(dataFile())) {
      await fs.copyFile(dataFile(), path.join(userDir(), `data.corrupt-${Date.now()}.json`)).catch(() => {});
      console.error('data.json illisible, copie de sauvegarde créée :', err);
    }
    return null;
  }
});

ipcMain.handle('data:write', async (_e, data: unknown) => {
  await writeAtomic(dataFile(), JSON.stringify(data));
  return true;
});

// Version synchrone pour la fermeture de la fenêtre : un invoke asynchrone
// lancé dans `beforeunload` peut ne jamais aboutir.
ipcMain.on('data:writeSync', (e, data: unknown) => {
  try {
    writeAtomicSync(dataFile(), JSON.stringify(data));
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});

ipcMain.handle('data:reveal', async () => {
  await fs.mkdir(userDir(), { recursive: true });
  shell.openPath(userDir());
  return userDir();
});

ipcMain.handle('settings:read', async () => readJsonSync(settingsFile()) ?? {});

ipcMain.handle('settings:write', async (_e, settings: unknown) => {
  await writeAtomic(settingsFile(), JSON.stringify(settings, null, 2));
  return true;
});

ipcMain.on('settings:writeSync', (e, settings: unknown) => {
  try {
    writeAtomicSync(settingsFile(), JSON.stringify(settings, null, 2));
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});

ipcMain.handle('file:save', async (_e, args: { defaultName: string; data: string; filters: Electron.FileFilter[] }) => {
  const res = await dialog.showSaveDialog(mainWindow!, { defaultPath: args.defaultName, filters: args.filters });
  if (res.canceled || !res.filePath) return null;
  await fs.writeFile(res.filePath, args.data, 'utf8');
  return res.filePath;
});

ipcMain.handle('file:open', async (_e, filters: Electron.FileFilter[]) => {
  const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters });
  if (res.canceled || !res.filePaths[0]) return null;
  return { path: res.filePaths[0], content: await fs.readFile(res.filePaths[0], 'utf8') };
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.on('app:show', () => showWindow());

ipcMain.on('prefs:apply', (_e, next: DesktopPrefs) => applyPrefs(next));

ipcMain.on('badge:set', (_e, count: number, dataUrl: string | null) => {
  if (!mainWindow) return;
  if (count > 0 && dataUrl)
    mainWindow.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${count} tâches restantes`);
  else mainWindow.setOverlayIcon(null, '');
  tray?.setToolTip(count > 0 ? `TaskHelper — ${count} tâche${count > 1 ? 's' : ''} aujourd’hui` : 'TaskHelper');
});

ipcMain.on('theme:set', (_e, theme: 'light' | 'dark') => {
  nativeTheme.themeSource = theme;
  mainWindow?.setTitleBarOverlay?.(theme === 'dark' ? OVERLAY_DARK : OVERLAY_LIGHT);
  mainWindow?.setBackgroundColor(theme === 'dark' ? '#101114' : '#f1f2f5');
});

/* ----------------------------------------------------------------- boot */

// Une seule instance : relancer l'app (raccourci, menu Démarrer) ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.setAppUserModelId(APP_ID);

  app.whenReady().then(async () => {
    await fs.mkdir(userDir(), { recursive: true });
    await dailyBackup().catch((err) => console.error('Sauvegarde quotidienne impossible :', err));

    const saved = readJsonSync<Partial<DesktopPrefs>>(settingsFile()) ?? {};
    const initial: DesktopPrefs = {
      closeToTray: saved.closeToTray ?? false,
      launchAtLogin: saved.launchAtLogin ?? false,
      globalShortcut: saved.globalShortcut ?? true,
    };

    buildMenu();
    // Lancée avec Windows, l'app démarre discrètement dans la zone de notification
    // — seulement si elle y a une icône, sinon elle serait inatteignable.
    const startHidden = process.argv.includes('--hidden') && initial.closeToTray;
    createWindow(startHidden);
    applyPrefs(initial);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    // En dev, il n'y a ni build publié ni fichier de métadonnées à lire ; et le
    // portable n'a pas d'emplacement fixe où s'installer par-dessus lui-même.
    if (app.isPackaged && !isPortableBuild()) setupAutoUpdater();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
