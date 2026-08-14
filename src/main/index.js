'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net } = require('electron');
const Store = require('./store');
const Organizer = require('./organizer');
const WindowManager = require('./windowManager');
const Watcher = require('./watcher');
const icons = require('./icons');
const desktop = require('./desktop');
const native = require('./native');

const APP_ID = 'com.cj.deskorganizer';
app.setAppUserModelId(APP_ID);

let store, organizer, wm, watcher, tray;
let isQuitting = false;

// 自定义协议：dzicon://<缓存文件名> 用于渲染分区内真实文件图标
protocol.registerSchemesAsPrivileged([
  { scheme: 'dzicon', privileges: { standard: false, secure: true, supportFetchAPI: false, stream: true } },
]);

// 单实例：再次启动时聚焦设置窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (wm) wm.createSettingsWindow();
  });

  app.whenReady().then(() => {
    const userDataDir = app.getPath('userData');
    // 支持隔离测试：DZ_DESKTOP 指向一个临时桌面目录，避免操作真实桌面
    const desktopPath = process.env.DZ_DESKTOP || app.getPath('desktop');

    // 数据层
    store = new Store(userDataDir);
    store.init();

    // 图标
    const projectRoot = path.join(__dirname, '..', '..');
    icons.init(userDataDir, path.join(projectRoot, 'scripts'));

    // 整理引擎（虚拟分组：文件永不移动）
    organizer = new Organizer(store);
    organizer.bind(desktopPath);

    // 窗口
    wm = new WindowManager(store, organizer);
    wm.init(desktopPath);
    wm.createAll();
    // 仅首次启动弹设置窗口；之后通过托盘/分区右键打开
    if (store.firstRun && store.config.settings.showOnLaunch !== false) wm.createSettingsWindow();

    // 监控（桌面目录变化 → 刷新分组）
    watcher = new Watcher(wm, desktopPath);
    watcher.start();

    // dzicon 协议
    protocol.handle('dzicon', (req) => {
      try {
        const file = path.join(icons.getCacheDir(), new URL(req.url).hostname);
        return net.fetch(pathToFileURL(file).toString());
      } catch (e) {
        return new Response('', { status: 404 });
      }
    });

    setupTray();

    app.on('activate', () => wm.createSettingsWindow());
  });
}

app.on('window-all-closed', (e) => {
  // 托盘常驻：不因窗口关闭而退出
});

app.on('before-quit', () => {
  isQuitting = true;
  if (watcher) watcher.stop();
  if (store) store.saveConfig();
});

app.on('quit', () => {
  // 清理临时图标任务文件
});

function setupTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('桌面整理助手');

  const buildMenu = () => {
    return Menu.buildFromTemplate([
      { label: '打开设置', click: () => wm.createSettingsWindow() },
      { label: '✨ 一键整理', click: () => { organizer.organizeOnce(); wm.refreshAll(); } },
      { type: 'separator' },
      {
        label: '隐藏桌面系统图标',
        type: 'checkbox',
        checked: false,
        click: async (item) => {
          await desktop.setIconsHidden(item.checked);
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; app.quit(); } },
    ]);
  };

  tray.setContextMenu(buildMenu());
  tray.on('click', () => wm.createSettingsWindow());
  tray.on('double-click', () => wm.createSettingsWindow());
}

module.exports = { getTray: () => tray };
