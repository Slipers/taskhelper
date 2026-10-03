const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, handler) {
  const listener = (_e, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('taskHelper', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),

  data: {
    read: () => ipcRenderer.invoke('data:read'),
    write: (data) => ipcRenderer.invoke('data:write', data),
    writeSync: (data) => ipcRenderer.sendSync('data:writeSync', data),
    reveal: () => ipcRenderer.invoke('data:reveal'),
  },

  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: (s) => ipcRenderer.invoke('settings:write', s),
    writeSync: (s) => ipcRenderer.sendSync('settings:writeSync', s),
  },

  files: {
    save: (args) => ipcRenderer.invoke('file:save', args),
    open: (filters) => ipcRenderer.invoke('file:open', filters),
  },

  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  applyPrefs: (prefs) => ipcRenderer.send('prefs:apply', prefs),
  setBadge: (count, dataUrl) => ipcRenderer.send('badge:set', count, dataUrl),
  showWindow: () => ipcRenderer.send('app:show'),
  onCommand: (handler) => subscribe('app:command', handler),

  focusGuard: {
    update: (args) => ipcRenderer.send('focusGuard:update', args),
    end: () => ipcRenderer.send('focusGuard:end'),
    onBlocked: (handler) => subscribe('focusGuard:blocked', handler),
    onError: (handler) => subscribe('focusGuard:error', handler),
  },

  apps: {
    running: () => ipcRenderer.invoke('apps:running'),
    pickExe: () => ipcRenderer.invoke('apps:pickExe'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onAvailable: (handler) => subscribe('updater:available', handler),
    onProgress: (handler) => subscribe('updater:progress', handler),
    onReady: (handler) => subscribe('updater:ready', handler),
    onError: (handler) => subscribe('updater:error', handler),
  },
});
