'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

/**
 * 图标提取与缓存。
 * - 缓存目录: <userData>/icon-cache
 * - 自定义协议 dzicon://<文件名> 由 main 注册，渲染进程直接 <img src="dzicon://...">
 * - 用 PowerShell System.Drawing.ExtractAssociatedIcon 提取真实图标；
 *   队列化批量提取（一次进程调用处理多个），失败则渲染端用 emoji 兜底。
 */

const PER_TYPE_EXTS = new Set(['.lnk', '.url', '.exe', '.msi', '.bat', '.cmd', '.ico']);
let cacheDir = '';
let psScript = '';

function init(userDataDir, scriptsDir) {
  cacheDir = path.join(userDataDir, 'icon-cache');
  psScript = path.join(scriptsDir, 'extract-icon.ps1');
  fs.mkdirSync(cacheDir, { recursive: true });
}

/** 计算缓存键：可执行/链接/文件夹按「路径+mtime」；普通文件按「扩展名」复用通用图标 */
function cacheKey(filePath, isDir) {
  const ext = path.extname(filePath).toLowerCase();
  if (isDir || PER_TYPE_EXTS.has(ext)) {
    let mtime = 0;
    try { mtime = Math.floor(fs.statSync(filePath).mtimeMs); } catch (e) {}
    return crypto.createHash('sha1').update(filePath + ':' + mtime).digest('hex') + '.png';
  }
  return crypto.createHash('sha1').update('ext:' + ext).digest('hex') + '.png';
}

/** 返回 { url, cacheFile } 或 null */
function iconFor(filePath, isDir) {
  if (!cacheDir) return null;
  const cacheFile = cacheKey(filePath, isDir);
  const full = path.join(cacheDir, cacheFile);
  if (fs.existsSync(full) && fs.statSync(full).size > 0) {
    return { url: 'dzicon://' + cacheFile, cacheFile };
  }
  return null;
}

/** 批量提取缺失图标。items: [{src, isDir}]，返回已完成的 [{src, url}] */
async function extractBatch(items) {
  if (!items.length) return [];
  const need = [];
  for (const it of items) {
    const cacheFile = cacheKey(it.src, it.isDir);
    const full = path.join(cacheDir, cacheFile);
    if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
      need.push({ src: it.src, out: full, cacheFile });
    }
  }
  if (!need.length) return [];
  const done = await runPs(need);
  return done.filter(Boolean).map((r) => ({ src: r.src, url: 'dzicon://' + r.cacheFile }));
}

let tmpCounter = 0;

function runPs(need) {
  return new Promise((resolve) => {
    const inputFile = path.join(cacheDir, '..', '.icon-job-' + (++tmpCounter) + '.json');
    const outputFile = path.join(cacheDir, '..', '.icon-out-' + (++tmpCounter) + '.json');
    const payload = need.map((n) => ({ src: n.src, out: n.out }));
    try { fs.writeFileSync(inputFile, JSON.stringify(payload), 'utf8'); } catch (e) { resolve(need.map(() => null)); return; }
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-InputFile', inputFile, '-OutputFile', outputFile]);
    let stderrText = '';
    child.stderr.on('data', (d) => (stderrText += d.toString()));
    child.on('close', () => {
      try {
        // PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM，trim() 可一并去掉
        const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8').trim());
        const bySrc = {};
        for (const res of parsed.results || []) {
          if (res.ok) bySrc[res.src] = true;
        }
        resolve(need.map((n) => (bySrc[n.src] ? n : null)));
      } catch (e) {
        console.error('[icons] 解析输出失败', e.message, stderrText.slice(0, 200));
        resolve(need.map(() => null));
      } finally {
        try { fs.unlinkSync(inputFile); } catch (e) {}
        try { fs.unlinkSync(outputFile); } catch (e) {}
      }
    });
    child.on('error', () => resolve(need.map(() => null)));
  });
}

module.exports = { init, iconFor, extractBatch, getCacheDir: () => cacheDir };
