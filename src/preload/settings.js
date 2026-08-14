'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const IPC = require('../shared/ipc');

contextBridge.exposeInMainWorld('dz', {
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (patch) => ipcRenderer.send(IPC.SETTINGS_SAVE, patch),
  onConfigChanged: (cb) => ipcRenderer.on(IPC.EVT_CONFIG_CHANGED, (e, data) => cb(data)),

  addPartition: (name, color) => ipcRenderer.invoke(IPC.PARTITION_ADD, name, color),
  removePartition: (id) => ipcRenderer.invoke(IPC.PARTITION_REMOVE, id),
  updatePartition: (id, patch) => ipcRenderer.send(IPC.PARTITION_UPDATE_CFG, id, patch),
  renamePartition: (id, name) => ipcRenderer.invoke(IPC.PARTITION_RENAME_THIS, id, name),
  saveRules: (rules) => ipcRenderer.invoke(IPC.RULES_SAVE, rules),

  organizeRun: () => ipcRenderer.invoke(IPC.ORGANIZE_RUN),
  organizeUndo: () => ipcRenderer.invoke(IPC.ORGANIZE_UNDO),
  organizeHistory: () => ipcRenderer.invoke(IPC.ORGANIZE_HISTORY),

  getIconsHidden: () => ipcRenderer.invoke(IPC.DESKTOP_ICONS_GET),
  setIconsHidden: (hidden) => ipcRenderer.invoke(IPC.DESKTOP_ICONS_SET, hidden),
  getAutoHide: () => ipcRenderer.invoke(IPC.AUTO_HIDE_GET),
  setAutoHide: (on) => ipcRenderer.invoke(IPC.AUTO_HIDE_SET, on),
  getScreens: () => ipcRenderer.invoke(IPC.DESKTOP_SCREENS),
  getAutoStart: () => ipcRenderer.invoke(IPC.AUTOSTART_GET),
  setAutoStart: (on) => ipcRenderer.invoke(IPC.AUTOSTART_SET, on),
});
