'use strict';

const { execFile } = require('child_process');

const ICONS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const SHCNE_ASSOCCHANGED = 0x08000000;
const SHCNF_FLUSH = 0x1000;

const WM_COMMAND = 0x0111;
const CMD_TOGGLE_DESKTOP_ICONS = 0x7402; // 资源管理器「查看-显示桌面图标」菜单命令

/**
 * 桌面系统图标隐藏/显示。
 * 首选：给桌面 SHELLDLL_DefView 发 WM_COMMAND(0x7402)——与右键菜单同一开关，
 * 立即生效、状态可靠（新 Win11 上注册表 HideIcons + SHChangeNotify 会闪一下又复原）。
 * 兜底：写注册表 HideIcons + SHChangeNotify（koffi 不可用时）。
 */

let user32 = null;
let fns = null;
try {
  const koffi = require('koffi');
  user32 = koffi.load('user32.dll');
  fns = {
    FindWindowA: user32.func('void* __stdcall FindWindowA(const char* cls, const char* title)'),
    FindWindowExA: user32.func('void* __stdcall FindWindowExA(void* parent, void* after, const char* cls, const char* title)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void* h)'),
    PostMessageA: user32.func('bool __stdcall PostMessageA(void* h, uint msg, uintptr wParam, intptr lParam)'),
  };
} catch (e) {
  console.warn('[desktop] koffi 不可用，图标隐藏走注册表兜底：', e.message);
  user32 = null;
  fns = null;
}

/** 找桌面图标视图：Progman -> SHELLDLL_DefView -> SysListView32(FolderView) */
function findDesktopViews() {
  if (!fns) return null;
  try {
    const progman = fns.FindWindowA('Progman', 'Program Manager');
    if (!progman) return null;
    const defView = fns.FindWindowExA(progman, null, 'SHELLDLL_DefView', null);
    if (!defView) return null;
    const listview =
      fns.FindWindowExA(defView, null, 'SysListView32', 'FolderView') ||
      fns.FindWindowExA(defView, null, 'SysListView32', null);
    return listview ? { defView, listview } : null;
  } catch (e) {
    return null;
  }
}

// ---------------- 注册表兜底 ----------------

function regAdd(hexValue) {
  return new Promise((resolve, reject) => {
    execFile('reg', ['add', ICONS_KEY, '/v', 'HideIcons', '/t', 'REG_DWORD', '/d', hexValue, '/f'], (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function regQuery() {
  return new Promise((resolve) => {
    execFile('reg', ['query', ICONS_KEY, '/v', 'HideIcons'], (err, stdout) => {
      if (err || !stdout) return resolve(0);
      const m = stdout.match(/HideIcons\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
      if (m) return resolve(parseInt(m[1], 16));
      resolve(0);
    });
  });
}

function notifyShellChange() {
  return new Promise((resolve) => {
    try {
      const koffi = require('koffi');
      const u = koffi.load('user32.dll');
      const SHChangeNotify = u.func('void __stdcall SHChangeNotify(long wEventId, uint uFlags, void* dwItem1, void* dwItem2)');
      SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_FLUSH, null, null);
      resolve(true);
    } catch (e) {
      // koffi 失败 -> PowerShell 兜底
      const ps = "Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class S {\n [DllImport(\"user32.dll\")] public static extern void SHChangeNotify(long wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);\n}\n'@\n[S]::SHChangeNotify(0x8000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)";
      const child = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
      child.on('close', () => resolve(true));
      child.on('error', () => resolve(false));
    }
  });
}

// ---------------- 对外接口 ----------------

async function setIconsHidden(hidden) {
  const views = findDesktopViews();
  if (views) {
    const visibleNow = !!fns.IsWindowVisible(views.listview);
    if (visibleNow === !hidden) return; // 已是目标状态，不重复切换
    fns.PostMessageA(views.defView, WM_COMMAND, CMD_TOGGLE_DESKTOP_ICONS, 0);
    return;
  }
  await regAdd(hidden ? '1' : '0');
  await notifyShellChange();
}

async function getIconsHidden() {
  const views = findDesktopViews();
  if (views) return !fns.IsWindowVisible(views.listview);
  const v = await regQuery();
  return v === 1;
}

module.exports = { setIconsHidden, getIconsHidden };
