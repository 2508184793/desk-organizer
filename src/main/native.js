'use strict';

const { spawn } = require('child_process');

/**
 * 原生 Win32 封装。
 * 优先用 koffi（N-API FFI，预编译、免编译器、Electron 主进程可直接加载）；
 * 加载失败则回退到 PowerShell P/Invoke（零原生依赖）。
 *
 * Electron 窗口句柄：win.getNativeWindowHandle() 返回 8 字节 Buffer（小端），
 * 用 koffi.decode(buf, 'HWND') 还原成指针值(BigInt) 后再作为 void* 传参。
 */

let koffi = null;
let user32 = null;
let HWND_TYPE = null;
try {
  koffi = require('koffi');
  HWND_TYPE = koffi.pointer('void');
  user32 = koffi.load('user32.dll');
  // 立即做一次探测调用，确认加载 OK
  const probe = user32.func('void* __stdcall GetDesktopWindow()');
  probe();
} catch (e) {
  console.warn('[native] koffi 不可用，回退 PowerShell：', e.message);
  koffi = null;
  user32 = null;
}

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const HWND_BOTTOM = 1n;

/** 把 Electron 的句柄 Buffer 解码成 koffi 指针值 */
function toHwnd(buf) {
  if (!buf) return null;
  if (koffi && HWND_TYPE) {
    return koffi.decode(buf, HWND_TYPE);
  }
  return buf.readBigUInt64LE(0); // 兜底：当 BigInt 传给 PowerShell
}

function nativeSetBottomMost(hwndBigInt) {
  const SetWindowPos = user32.func('bool __stdcall SetWindowPos(void* hWnd, void* hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
  return SetWindowPos(hwndBigInt, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
}

/**
 * 把窗口压到最底（贴壁纸、在所有普通窗口之下）。
 * 返回 true 表示已通过 koffi 置底成功；false 表示需要调用方用 PowerShell 兜底。
 * @param {Buffer} nativeHandleBuf Electron getNativeWindowHandle() 的返回
 */
function setBottomMost(nativeHandleBuf) {
  if (!koffi) return false;
  const hwnd = toHwnd(nativeHandleBuf);
  if (!hwnd) return false;
  try {
    return !!nativeSetBottomMost(hwnd);
  } catch (e) {
    console.error('[native] SetWindowPos 失败', e.message);
    return false;
  }
}

/** PowerShell P/Invoke 兜底：SetWindowPos(hwnd, HWND_BOTTOM) */
function psSetBottomMostAsync(nativeHandleBuf) {
  const hwnd = nativeHandleBuf.readBigUInt64LE(0).toString();
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NZ {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@
[NZ]::SetWindowPos([IntPtr]${hwnd}, [IntPtr]1, 0,0,0,0, 0x13) | Out-Null`;
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    child.on('close', () => resolve(true));
    child.on('error', () => resolve(false));
  });
}

module.exports = {
  setBottomMost,
  psSetBottomMostAsync,
  get backend() { return koffi ? 'koffi' : 'powershell'; },
};
