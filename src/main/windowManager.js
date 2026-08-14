'use strict';

const path = require('path');
const { BrowserWindow, ipcMain, screen, app } = require('electron');
const native = require('./native');
const desktop = require('./desktop');
const shell = require('./shell');
const icons = require('./icons');
const IPC = require('../shared/ipc');
const { TYPE_EMOJI } = require('../shared/types');

/**
 * 窗口管理：创建/维护每个分区的悬浮窗口 + 设置窗口，并注册全部 IPC。
 */
class WindowManager {
  constructor(store, organizer) {
    this.store = store;
    this.organizer = organizer;
    this.partitionWindows = new Map(); // id -> BrowserWindow
    this.settingsWindow = null;
    this.desktopPath = '';
    this._saveTimer = null;
  }

  init(desktopPath) {
    this.desktopPath = desktopPath;
    this._registerIpc();
  }

  getPartitionById(id) {
    return this.store.config.partitions.find((x) => x.id === id) || null;
  }

  // ---------------- 分区窗口 ----------------

  createAll() {
    for (const p of this.store.config.partitions) this.createPartitionWindow(p);
  }

  createPartitionWindow(partition) {
    if (this.partitionWindows.has(partition.id)) return;
    const preload = path.join(__dirname, '..', 'preload', 'partition.js');
    const win = new BrowserWindow({
      x: partition.x, y: partition.y,
      width: partition.width, height: partition.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,          // 用自绘角柄缩放，避免透明无边框的原生缩放手感差
      movable: false,
      alwaysOnTop: false,
      focusable: false,          // 等价 WS_EX_NOACTIVATE：不抢焦点、不进 Alt-Tab
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'partition', 'index.html'), {
      query: { id: partition.id },
    });

    win.once('ready-to-show', () => {
      win.show();
      this._pinBottom(win);
    });

    // 窗口自身被系统移动/缩放时同步配置
    win.on('moved', () => this._syncBounds(partition.id));
    win.on('resized', () => this._syncBounds(partition.id));
    win.on('closed', () => this.partitionWindows.delete(partition.id));

    this.partitionWindows.set(partition.id, win);
  }

  _pinBottom(win) {
    try {
      const buf = win.getNativeWindowHandle();
      if (!native.setBottomMost(buf)) {
        // koffi 不可用时走 PowerShell 兜底
        native.psSetBottomMostAsync(buf);
      }
    } catch (e) { console.error('置底失败', e.message); }
  }

  _syncBounds(partitionId) {
    const win = this.partitionWindows.get(partitionId);
    const p = this.getPartitionById(partitionId);
    if (!win || !p) return;
    const [x, y] = win.getPosition();
    const [w, h] = win.getSize();
    Object.assign(p, { x, y, width: w, height: h });
    this._scheduleSave();
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.store.saveConfig(), 500);
  }

  destroyPartitionWindow(id) {
    const win = this.partitionWindows.get(id);
    if (win && !win.isDestroyed()) win.destroy();
    this.partitionWindows.delete(id);
  }

  refreshPartition(id) {
    const win = this.partitionWindows.get(id);
    if (!win || win.isDestroyed()) return;
    const partition = this.getPartitionById(id);
    if (!partition) return;
    const data = this._buildPartitionPayload(partition);
    win.webContents.send(IPC.PARTITION_REFRESH, data);
  }

  refreshAll() {
    for (const id of this.partitionWindows.keys()) this.refreshPartition(id);
    this._notifySettingsChanged();
  }

  /** 组装分区数据：条目 + 图标，并异步补齐缺失的真实图标 */
  _buildPartitionPayload(partition) {
    const items = this.organizer.listPartition(partition).map((it) => ({
      ...it,
      iconUrl: icons.iconFor(it.path, it.isDir)?.url || null,
      iconFallback: this._fallbackEmoji(it),
    }));
    // 后台补齐图标后推送刷新
    const missing = items.filter((it) => !it.iconUrl).map((it) => ({ src: it.path, isDir: it.isDir }));
    if (missing.length) {
      icons.extractBatch(missing).then((done) => {
        if (done.length) this.refreshPartition(partition.id);
      }).catch(() => {});
    }
    return { partition, items };
  }

  _fallbackEmoji(it) {
    if (it.isDir) return '📁';
    const ext = path.extname(it.name).toLowerCase();
    return TYPE_EMOJI[ext] || '📄';
  }

  // ---------------- 设置窗口 ----------------

  createSettingsWindow() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }
    const preload = path.join(__dirname, '..', 'preload', 'settings.js');
    const win = new BrowserWindow({
      width: 900,
      height: 680,
      minWidth: 720,
      minHeight: 520,
      title: '桌面整理助手 - 设置',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => (this.settingsWindow = null));
    this.settingsWindow = win;
  }

  _notifySettingsChanged() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.webContents.send(IPC.EVT_CONFIG_CHANGED, this._settingsPayload());
    }
  }

  _settingsPayload() {
    return {
      partitions: this.store.config.partitions,
      rules: this.store.config.rules,
      settings: this.store.config.settings,
    };
  }

  // ---------------- IPC ----------------

  _registerIpc() {
    // ---- 打开设置窗口 ----
    ipcMain.on(IPC.OPEN_SETTINGS, () => this.createSettingsWindow());

    // ---- 分区数据 ----
    ipcMain.handle(IPC.PARTITION_GET, (e, id) => {
      const p = this.getPartitionById(id);
      return p ? this._buildPartitionPayload(p) : null;
    });

    // ---- 窗口位置/外观更新（拖动缩放时由渲染进程高频调用）----
    ipcMain.on(IPC.PARTITION_UPDATE_CFG, (e, id, patch) => {
      const p = this.getPartitionById(id);
      const win = this.partitionWindows.get(id);
      if (!p) return;
      Object.assign(p, patch);
      if (win && !win.isDestroyed()) {
        if (patch.x != null || patch.y != null || patch.width != null || patch.height != null) {
          const [x, y] = win.getPosition();
          const [w, h] = win.getSize();
          win.setBounds({
            x: patch.x ?? x, y: patch.y ?? y,
            width: patch.width ?? w, height: patch.height ?? h,
          }, false);
        }
      }
      this._scheduleSave();
    });

    ipcMain.on(IPC.PARTITION_COLLAPSE, (e, id, collapsed) => {
      const p = this.getPartitionById(id);
      const win = this.partitionWindows.get(id);
      if (!p || !win) return;
      p.collapsed = !!collapsed;
      const [w] = win.getSize();
      win.setSize(w, collapsed ? 34 : p.height || 260, false);
      this._scheduleSave();
      this._notifySettingsChanged();
    });

    // ---- 文件操作（虚拟分组：拖入=分配，移出=取消分配）----
    ipcMain.handle(IPC.PARTITION_DROP_FILES, (e, id, filePaths) => {
      const p = this.getPartitionById(id);
      if (!p || !Array.isArray(filePaths)) return { assigned: 0, moved: 0 };
      const result = this.organizer.assignTo(p, filePaths);
      this.refreshAll();
      return result;
    });

    ipcMain.handle(IPC.PARTITION_MOVE_OUT, (e, id, filePath) => {
      this.organizer.unassign(filePath);
      this.refreshAll();
      return 1;
    });

    ipcMain.handle(IPC.PARTITION_OPEN, async (e, filePath) => shell.open(filePath));
    ipcMain.on(IPC.PARTITION_SHOW_IN_FOLDER, (e, filePath) => shell.showInFolder(filePath));

    ipcMain.handle(IPC.PARTITION_DELETE, async (e, id, filePath) => {
      await shell.trash(filePath);
      const p = this.getPartitionById(id);
      if (p) this.organizer.clearPin(p, filePath);
      this.refreshAll();
    });

    ipcMain.handle(IPC.PARTITION_RENAME, (e, id, filePath, newName) => {
      const dest = shell.rename(filePath, newName);
      this.refreshAll();
      return dest;
    });

    ipcMain.on(IPC.PARTITION_PIN, (e, id, filePath, pinned) => {
      const p = this.getPartitionById(id);
      if (!p) return;
      p.pins = p.pins || [];
      const name = path.basename(filePath);
      const i = p.pins.indexOf(name);
      if (pinned && i < 0) p.pins.push(name);
      if (!pinned && i >= 0) p.pins.splice(i, 1);
      this.store.saveConfig();
      this.refreshPartition(id);
    });

    // ---- 设置窗口 ----
    ipcMain.handle(IPC.SETTINGS_GET, () => this._settingsPayload());

    ipcMain.on(IPC.SETTINGS_SAVE, (e, patch) => {
      const s = this.store.config.settings;
      Object.assign(s, patch);
      this.store.saveConfig();
      if (patch.autoStart !== undefined) {
        app.setLoginItemSettings({ openAtLogin: !!patch.autoStart });
      }
      this._notifySettingsChanged();
    });

    ipcMain.handle(IPC.PARTITION_ADD, (e, name, color) => {
      const p = {
        id: 'part-' + Date.now().toString(36),
        name: name || '新分区',
        x: 40 + (this.store.config.partitions.length % 5) * 300,
        y: 40 + Math.floor(this.store.config.partitions.length / 5) * 280,
        width: 270, height: 260,
        color: color || '#4c8bf5', opacity: 0.55, rounded: true, collapsed: false,
        pins: [], locked: false,
      };
      this.store.config.partitions.push(p);
      this.store.saveConfig();
      this.createPartitionWindow(p);
      this._notifySettingsChanged();
      return p;
    });

    ipcMain.handle(IPC.PARTITION_REMOVE, (e, id) => {
      this.store.config.partitions = this.store.config.partitions.filter((x) => x.id !== id);
      this.destroyPartitionWindow(id);
      this.store.saveConfig();
      this._notifySettingsChanged();
    });

    ipcMain.handle(IPC.PARTITION_RENAME_THIS, (e, id, newName) => {
      const p = this.getPartitionById(id);
      if (!p || !newName || newName === p.name) return p;
      const oldName = p.name;
      p.name = newName;
      // 同步更新指向该分区的规则
      for (const r of this.store.config.rules || []) {
        if (r.partitionName === oldName) r.partitionName = newName;
      }
      this.store.saveConfig();
      this.refreshPartition(id);
      this._notifySettingsChanged();
      return p;
    });

    ipcMain.handle(IPC.RULES_SAVE, (e, rules) => {
      this.store.config.rules = rules;
      this.store.saveConfig();
      return this.store.config.rules;
    });

    ipcMain.handle(IPC.ORGANIZE_RUN, () => {
      // 虚拟分区：一键整理只是重算分组，不做任何移动
      const result = this.organizer.organizeOnce();
      this.refreshAll();
      return result;
    });

    ipcMain.handle(IPC.ORGANIZE_UNDO, () => {
      // 虚拟分区无文件移动，撤销无实际意义（保留通道以防旧渲染端调用）
      return { undone: 0 };
    });

    ipcMain.handle(IPC.ORGANIZE_HISTORY, () => this.organizer.groupingOverview());

    ipcMain.handle(IPC.DESKTOP_ICONS_GET, () => desktop.getIconsHidden());
    ipcMain.handle(IPC.DESKTOP_ICONS_SET, async (e, hidden) => {
      await desktop.setIconsHidden(!!hidden);
      this.store.config.settings.iconsHidden = !!hidden;
      this.store.saveConfig();
      return hidden;
    });

    ipcMain.handle(IPC.DESKTOP_SCREENS, () =>
      screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }))
    );

    ipcMain.handle(IPC.AUTOSTART_GET, () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle(IPC.AUTOSTART_SET, (e, on) => {
      app.setLoginItemSettings({ openAtLogin: !!on });
      return on;
    });
  }
}

module.exports = WindowManager;
