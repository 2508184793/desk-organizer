'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

/** 打开文件/文件夹/快捷方式 */
async function open(p) {
  if (!fs.existsSync(p)) return '文件不存在';
  return await shell.openPath(p);
}

/** 在资源管理器中定位 */
function showInFolder(p) {
  shell.showItemInFolder(p);
}

/** 移入回收站 */
async function trash(p) {
  if (!fs.existsSync(p)) return '文件不存在';
  await shell.trashItem(p);
}

/** 分区内重命名（自动处理重名） */
function rename(p, newName) {
  const dir = path.dirname(p);
  let dest = path.join(dir, newName);
  let i = 1;
  const ext = path.extname(newName);
  const base = path.basename(newName, ext);
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${base} (${i})${ext}`);
    i++;
  }
  fs.renameSync(p, dest);
  return dest;
}

/** 解析 .lnk 快捷方式目标（供需要时使用） */
function getShortcutTarget(p) {
  if (!/\.lnk$/i.test(p)) return null;
  const { execFileSync } = require('child_process');
  try {
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${JSON.stringify(p)}); $s.TargetPath + '|' + $s.Arguments`;
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8' }).trim();
    return out;
  } catch (e) {
    return null;
  }
}

module.exports = { open, showInFolder, trash, rename, getShortcutTarget };
