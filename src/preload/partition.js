'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const IPC = require('../shared/ipc');

contextBridge.exposeInMainWorld('dz', {
  // 数据
  getPartition: (id) => ipcRenderer.invoke(IPC.PARTITION_GET, id),
  onRefresh: (cb) => ipcRenderer.on(IPC.PARTITION_REFRESH, (e, data) => cb(data)),

  // 窗口
  updateConfig: (id, patch) => ipcRenderer.send(IPC.PARTITION_UPDATE_CFG, id, patch),
  collapse: (id, collapsed) => ipcRenderer.send(IPC.PARTITION_COLLAPSE, id, collapsed),
  showMenu: (id, kind, item) => ipcRenderer.send(IPC.PARTITION_CTX_MENU, id, kind, item),

  // 文件
  dropFiles: (id, paths) => ipcRenderer.invoke(IPC.PARTITION_DROP_FILES, id, paths),
  moveOut: (id, path) => ipcRenderer.invoke(IPC.PARTITION_MOVE_OUT, id, path),
  open: (path) => ipcRenderer.invoke(IPC.PARTITION_OPEN, path),
  showInFolder: (path) => ipcRenderer.send(IPC.PARTITION_SHOW_IN_FOLDER, path),
  remove: (id, path) => ipcRenderer.invoke(IPC.PARTITION_DELETE, id, path),
  rename: (id, path, newName) => ipcRenderer.invoke(IPC.PARTITION_RENAME, id, path, newName),
  pin: (id, path, pinned) => ipcRenderer.send(IPC.PARTITION_PIN, id, path, pinned),

  // 分区管理
  removePartition: (id) => ipcRenderer.invoke(IPC.PARTITION_REMOVE, id),
  renamePartition: (id, name) => ipcRenderer.invoke(IPC.PARTITION_RENAME_THIS, id, name),
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),

  // 拖入文件时把 File 转成真实路径
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
