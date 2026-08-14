'use strict';

const fs = require('fs');

/**
 * 桌面目录监控（虚拟分区模式）。
 * 虚拟分组下分区内容完全由「规则 + 分配表」即时计算，桌面目录一有变化就整体刷新，
 * 防抖 300ms 合并高频事件（如批量移动/下载）。
 */
class Watcher {
  constructor(windowManager, desktopPath) {
    this.wm = windowManager;
    this.desktopPath = desktopPath;
    this.watchers = [];
    this._timer = null;
  }

  start() {
    try {
      const w = fs.watch(this.desktopPath, { persistent: true }, (event, filename) => {
        if (!filename) return;
        this._scheduleRefresh();
      });
      this.watchers.push(w);
    } catch (e) { console.error('[watcher] 监听桌面失败', e.message); }
  }

  _scheduleRefresh() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.wm.refreshAll(), 300);
  }

  stop() {
    clearTimeout(this._timer);
    for (const w of this.watchers) { try { w.close(); } catch (e) {} }
    this.watchers = [];
  }
}

module.exports = Watcher;
