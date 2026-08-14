'use strict';

const { execFile, spawn } = require('child_process');
const path = require('path');

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

let watchdogStarted = false;

/**
 * 图标隐藏期间拉起独立看门狗进程：主程序崩溃/被强杀后自动恢复系统图标。
 * Electron 主进程 spawn 的子进程在 app 退出时会被 Job Object 连坐杀掉，
 * 所以经 WMI Win32_Process.Create 创建看门狗（父进程是 WMI 服务，不在 Job 内）。
 * 幂等（图标已显示或新实例接管时不动作），一个会话只拉起一次。
 */
function startIconWatchdog() {
  if (watchdogStarted || process.env.DZ_DESKTOP) return;
  watchdogStarted = true;
  const script = resolveWatchdogScript();
  try {
    const exeName = path.basename(process.execPath, '.exe');
    // 启动器把参数放进环境变量（避免拼接超长/带引号的命令行），再经 WMI 创建看门狗。
    // 父进程启动时间由启动器从系统精确读取（与看门狗端同一格式），用于 PID 复用防护。
    const bootstrap = [
      "$ppid = [Environment]::GetEnvironmentVariable('DZ_WATCH_PID', 'Process')",
      "$proc = Get-Process -Id $ppid -ErrorAction SilentlyContinue",
      "$st = ''; if ($proc) { $st = $proc.StartTime.ToUniversalTime().ToString('o') }",
      "$s = [Environment]::GetEnvironmentVariable('DZ_WATCH_SCRIPT', 'Process')",
      "$cl = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $s + '\" -ParentPid ' + $ppid + ' -ProcName \"' + [Environment]::GetEnvironmentVariable('DZ_WATCH_NAME', 'Process') + '\" -ParentStartTime \"' + $st + '\"'",
      "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cl } | Out-Null",
    ].join('; ');
    const env = { ...process.env };
    env.DZ_WATCH_SCRIPT = script;
    env.DZ_WATCH_PID = String(process.pid);
    env.DZ_WATCH_NAME = exeName;
    const child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', bootstrap],
      { stdio: 'ignore', windowsHide: true, env });
    child.unref();
  } catch (e) {
    console.warn('[desktop] 看门狗启动失败', e.message);
  }
}

async function setIconsHidden(hidden) {
  const views = findDesktopViews();
  if (views) {
    const visibleNow = !!fns.IsWindowVisible(views.listview);
    if (visibleNow === !hidden) return; // 已是目标状态，不重复切换
    fns.PostMessageA(views.defView, WM_COMMAND, CMD_TOGGLE_DESKTOP_ICONS, 0);
    if (hidden) {
      startIconWatchdog(); // 隐藏期间由看门狗兜底崩溃恢复
      setRunOnceRestore(); // 关机/断电兜底：下次登录必然恢复
    } else {
      clearRunOnceRestore();
    }
    return;
  }
  await regAdd(hidden ? '1' : '0');
  await notifyShellChange();
  if (hidden) {
    startIconWatchdog();
    setRunOnceRestore();
  } else {
    clearRunOnceRestore();
  }
}

const RUN_ONCE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce';
const RUN_ONCE_NAME = 'DZ_RestoreIcons';

function resolveWatchdogScript() {
  let script = path.join(__dirname, '..', '..', 'scripts', 'restore-icons-watchdog.ps1');
  // 打包后脚本在 asar 虚拟文件系统内，PowerShell 无法运行，需指向解包后的真实路径
  if (script.includes('app.asar') && !script.includes('app.asar.unpacked')) {
    script = script.replace('app.asar', 'app.asar.unpacked');
  }
  return script;
}

/**
 * 注册一次"下次登录恢复图标"的 RunOnce。
 * 覆盖关机/断电 + 未开自启的场景：重启后应用不在了，也必然把图标显示回来。
 * 图标隐藏时写入，显示时（含正常退出）删除。
 */
function setRunOnceRestore() {
  try {
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${resolveWatchdogScript()}" -ForceShow`;
    execFile('reg', ['add', RUN_ONCE_KEY, '/v', RUN_ONCE_NAME, '/t', 'REG_SZ', '/d', cmd, '/f'], () => {});
  } catch (e) { console.warn('[desktop] RunOnce 注册失败', e.message); }
}

function clearRunOnceRestore() {
  execFile('reg', ['delete', RUN_ONCE_KEY, '/v', RUN_ONCE_NAME, '/f'], () => {});
}

async function getIconsHidden() {
  const views = findDesktopViews();
  if (views) return !fns.IsWindowVisible(views.listview);
  const v = await regQuery();
  return v === 1;
}

module.exports = { setIconsHidden, getIconsHidden };
