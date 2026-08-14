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

// 系统桌面图标接管状态（仅真实桌面模式生效，隔离测试不碰注册表）
let iconsHiddenNow = false;  // 注册表 HideIcons 的当前值
let iconsAutoHidden = false; // 本次会话由自动接管隐藏（退出时恢复；手动切换过则不再恢复）

/** 手动隐藏/显示系统桌面图标（托盘、设置窗口共用） */
async function applyIconsHidden(hidden) {
  await desktop.setIconsHidden(hidden);
  iconsHiddenNow = hidden;
  iconsAutoHidden = false; // 手动操作视为用户接管，退出时保持现状
  store.config.settings.iconsHidden = hidden;
  store.saveConfig();
  rebuildTrayMenu();
  return hidden;
}

/** 启动接管：默认隐藏系统图标；关闭该功能时清理上次崩溃遗留的隐藏态 */
async function startupIconTakeover() {
  if (process.env.DZ_DESKTOP) return;
  if (store.config.settings.autoHideIcons === false) {
    if (await desktop.getIconsHidden()) await desktop.setIconsHidden(false);
    return;
  }
  if (await desktop.getIconsHidden()) { iconsHiddenNow = true; return; }
  await desktop.setIconsHidden(true);
  iconsHiddenNow = true;
  iconsAutoHidden = true;
  rebuildTrayMenu();
}

/** 设置窗口：开/关「启动时自动隐藏系统图标」 */
async function setAutoHide(on) {
  store.config.settings.autoHideIcons = on;
  store.saveConfig();
  if (!process.env.DZ_DESKTOP) {
    if (on && !iconsHiddenNow) {
      await desktop.setIconsHidden(true);
      iconsHiddenNow = true;
      iconsAutoHidden = true;
    } else if (!on && iconsAutoHidden) {
      // 关闭自动接管：撤销本次自动隐藏，还原系统图标
      await desktop.setIconsHidden(false);
      iconsHiddenNow = false;
      iconsAutoHidden = false;
    }
  }
  rebuildTrayMenu();
  return on;
}

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
    wm = new WindowManager(store, organizer, {
      onIconsSet: applyIconsHidden,
      onAutoHideGet: () => store.config.settings.autoHideIcons !== false,
      onAutoHideSet: setAutoHide,
    });
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
    startupIconTakeover(); // 异步接管桌面（隐藏系统图标），不阻塞启动

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

app.on('will-quit', (e) => {
  // 程序不在运行时系统图标必须可见：退出前一律恢复（崩溃场景由看门狗进程兜底）
  if (!iconsHiddenNow) return;
  e.preventDefault();
  iconsHiddenNow = false;
  iconsAutoHidden = false;
  desktop.setIconsHidden(false).catch(() => {}).finally(() => app.exit());
});

app.on('quit', () => {
  // 清理临时图标任务文件
});

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '打开设置', click: () => wm.createSettingsWindow() },
    { label: '✨ 一键整理', click: () => { organizer.organizeOnce(); wm.refreshAll(); } },
    { type: 'separator' },
    {
      label: '隐藏桌面系统图标',
      type: 'checkbox',
      checked: iconsHiddenNow,
      click: (item) => applyIconsHidden(item.checked),
    },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function rebuildTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function setupTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('桌面整理助手');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => wm.createSettingsWindow());
  tray.on('double-click', () => wm.createSettingsWindow());
}

module.exports = { getTray: () => tray };
