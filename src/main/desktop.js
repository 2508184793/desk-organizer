'use strict';

const { execFile } = require('child_process');

const ICONS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const SHCNE_ASSOCCHANGED = 0x08000000;
const SHCNF_FLUSH = 0x1000;

/**
 * 桌面系统图标隐藏/显示。
 * 原理：写注册表 HideIcons，再发 SHChangeNotify 通知资源管理器刷新。
 * 注意：这是全局设置（资源管理器「显示桌面图标」开关），恢复时同样走注册表。
 */

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
      const user32 = koffi.load('user32.dll');
      const SHChangeNotify = user32.func('void __stdcall SHChangeNotify(long wEventId, uint uFlags, void* dwItem1, void* dwItem2)');
      SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_FLUSH, null, null);
      resolve(true);
    } catch (e) {
      // koffi 失败 → PowerShell 兜底
      const ps = "Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class S {\n [DllImport(\"user32.dll\")] public static extern void SHChangeNotify(long wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);\n}\n'@\n[S]::SHChangeNotify(0x8000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)";
      const child = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
      child.on('close', () => resolve(true));
      child.on('error', () => resolve(false));
    }
  });
}

async function setIconsHidden(hidden) {
  await regAdd(hidden ? '1' : '0');
  await notifyShellChange();
}

async function getIconsHidden() {
  const v = await regQuery();
  return v === 1;
}

module.exports = { setIconsHidden, getIconsHidden };
