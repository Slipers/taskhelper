import type { AppData, AppSettings, Task } from '../core/types';
import { DEFAULT_SETTINGS, emptyData } from '../core/types';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface UpdateAvailableInfo {
  version: string;
  notes: string | null;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateReadyInfo {
  version: string;
}

export type UpdateCheckResult =
  | { status: 'available'; version: string }
  | { status: 'none' }
  | { status: 'disabled' }
  | { status: 'error'; message: string };

interface UpdaterApi {
  check(): Promise<UpdateCheckResult>;
  download(): Promise<void>;
  install(): Promise<void>;
  onAvailable(handler: (info: UpdateAvailableInfo) => void): () => void;
  onProgress(handler: (progress: UpdateProgress) => void): () => void;
  onReady(handler: (info: UpdateReadyInfo) => void): () => void;
  onError(handler: (message: string) => void): () => void;
}

export interface DesktopPrefs {
  closeToTray: boolean;
  launchAtLogin: boolean;
  globalShortcut: boolean;
}

interface TaskHelperApi {
  platform: string;
  getVersion(): Promise<string>;
  data: {
    read(): Promise<AppData | null>;
    write(data: AppData): Promise<boolean>;
    writeSync(data: AppData): boolean;
    reveal(): Promise<string>;
  };
  settings: {
    read(): Promise<Partial<AppSettings>>;
    write(s: AppSettings): Promise<boolean>;
    writeSync(s: AppSettings): boolean;
  };
  files: {
    save(args: { defaultName: string; data: string; filters: FileFilter[] }): Promise<string | null>;
    open(filters: FileFilter[]): Promise<{ path: string; content: string } | null>;
  };
  setTheme(theme: 'light' | 'dark'): void;
  applyPrefs(prefs: DesktopPrefs): void;
  setBadge(count: number, dataUrl: string | null): void;
  showWindow(): void;
  onCommand(handler: (command: string) => void): () => void;
  updater: UpdaterApi;
}

const api: TaskHelperApi | undefined = (window as unknown as { taskHelper?: TaskHelperApi }).taskHelper;

/** Vrai quand l'app tourne dans Electron ; faux si le renderer est ouvert seul dans un navigateur. */
export const isDesktop = Boolean(api);

const LS_DATA = 'taskhelper:data';
const LS_SETTINGS = 'taskhelper:settings';

/* ------------------------------------------------------------ données */

export async function readData(): Promise<AppData> {
  let raw: AppData | null = null;
  try {
    raw = api ? await api.data.read() : (JSON.parse(localStorage.getItem(LS_DATA) ?? 'null') as AppData | null);
  } catch {
    raw = null;
  }
  return sanitizeData(raw);
}

export async function writeData(data: AppData): Promise<void> {
  if (api) {
    await api.data.write(data);
    return;
  }
  localStorage.setItem(LS_DATA, JSON.stringify(data));
}

/** Enregistrement immédiat et bloquant, pour la fermeture de la fenêtre. */
export function writeAllSync(data: AppData, settings: AppSettings) {
  if (api) {
    api.data.writeSync(data);
    api.settings.writeSync(settings);
    return;
  }
  localStorage.setItem(LS_DATA, JSON.stringify(data));
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

export async function revealDataFolder(): Promise<void> {
  await api?.data.reveal();
}

/** Remet d'aplomb un fichier lu sur disque ou importé : champs manquants, liste par défaut absente… */
export function sanitizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  const lists =
    Array.isArray(r.lists) && r.lists.length ? r.lists.filter((l) => l && typeof l.id === 'string') : base.lists;
  if (!lists.some((l) => l.id === base.lists[0]!.id)) lists.unshift(base.lists[0]!);
  const listIds = new Set(lists.map((l) => l.id));
  const rawTasks: Array<Partial<Task>> = Array.isArray(r.tasks) ? r.tasks : [];
  const tasks: Task[] = rawTasks
    .filter((t) => t && typeof t.id === 'string')
    .map((t) => ({
      notes: '',
      date: null,
      time: null,
      priority: 0 as const,
      estimate: null,
      recur: null,
      done: false,
      doneAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...t,
      id: t.id!,
      title: String(t.title ?? ''),
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      listId: t.listId && listIds.has(t.listId) ? t.listId : base.lists[0]!.id,
      order: Number.isFinite(t.order) ? t.order! : 0,
    }));
  return { version: 1, lists, tasks };
}

/* ---------------------------------------------------------- réglages */

export async function readSettings(): Promise<AppSettings> {
  let stored: Partial<AppSettings> = {};
  try {
    stored = api
      ? await api.settings.read()
      : (JSON.parse(localStorage.getItem(LS_SETTINGS) ?? '{}') as Partial<AppSettings>);
  } catch {
    stored = {};
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  if (api) {
    await api.settings.write(settings);
    return;
  }
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

/* -------------------------------------------------------- fichiers */

export async function saveTextFile(defaultName: string, data: string, filters: FileFilter[]): Promise<string | null> {
  if (api) return api.files.save({ defaultName, data, filters });
  const url = URL.createObjectURL(new Blob([data], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

export async function openTextFile(filters: FileFilter[]): Promise<string | null> {
  if (api) {
    const res = await api.files.open(filters);
    return res?.content ?? null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.click();
  });
}

/* ----------------------------------------------------------- bureau */

export function setNativeTheme(theme: 'light' | 'dark') {
  api?.setTheme(theme);
}

export function applyDesktopPrefs(prefs: DesktopPrefs) {
  api?.applyPrefs(prefs);
}

/** Pastille sur l'icône de la barre des tâches : nombre de tâches du jour restantes. */
export function setBadge(count: number) {
  if (!api) return;
  if (count <= 0) {
    api.setBadge(0, null);
    return;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f0556d';
  g.beginPath();
  g.arc(16, 16, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${count > 9 ? 17 : 21}px "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(count > 99 ? '99' : String(count), 16, 17);
  api.setBadge(count, c.toDataURL());
}

export function showWindow() {
  if (api) api.showWindow();
  else window.focus();
}

/** Commandes venues du processus principal : menu, raccourci global, icône de notification. */
export function onAppCommand(handler: (command: string) => void): () => void {
  return api?.onCommand(handler) ?? (() => {});
}

/* -------------------------------------------------------- mise à jour */

/** `null` en dehors d'Electron (navigateur) ou en dev : il n'y a alors rien à mettre à jour. */
export const updater: UpdaterApi | null = api?.updater ?? null;

export async function getFullVersion(): Promise<string> {
  return api ? api.getVersion() : __APP_VERSION__;
}

/**
 * Numéro de version affiché à l'utilisateur (ex. « 1.1 ») : le patch est tu
 * quand il vaut 0, conformément à la convention 1.0/1.1/… de ces applications.
 */
export function displayVersion(full: string): string {
  return full.replace(/^(\d+\.\d+)\.0$/, '$1');
}
