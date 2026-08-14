'use strict';

const fs = require('fs');
const path = require('path');
const { firstMatch } = require('./rules');

/**
 * 虚拟分区模型：
 * 文件永不移动，分区只是「规则 + 分配表」计算出的视觉分组。
 *  - 归属规则：显式分配表(assignments) > 规则引擎(rules) > 未分类
 *  - 一键整理只是重算分组，不做任何文件操作
 *  - 拖入分区 = 写入分配表；移出分区 = 删除分配项
 * 唯一例外：从资源管理器拖入的外部文件会先移动到桌面根目录（用户主动操作）。
 */
class Organizer {
  constructor(store) {
    this.store = store;
    this.desktopPath = null;
  }

  bind(desktopPath) {
    this.desktopPath = desktopPath ? path.normalize(desktopPath) : null;
  }

  /** 系统/隐藏类文件不参与分组 */
  isSystemFile(name) {
    return /^desktop\.ini$/i.test(name) || /^thumbs\.db$/i.test(name) || /^\./.test(name) || /^~\$/.test(name);
  }

  /** 桌面根目录所有非系统条目 */
  collectEntries(desktopPath) {
    let names = [];
    try { names = fs.readdirSync(desktopPath, { withFileTypes: true }); } catch (e) { return []; }
    return names
      .filter((d) => !this.isSystemFile(d.name))
      .map((d) => ({ name: d.name, path: path.join(desktopPath, d.name), isDir: d.isDirectory() }));
  }

  /** 计算一个条目归属的分区名（排除表 > 分配表 > 规则 > null=未分类） */
  partitionNameFor(entry) {
    const normalized = path.normalize(entry.path);
    const excluded = this.store.config.excluded || [];
    if (excluded.includes(normalized)) return null;
    const assignments = this.store.config.assignments || {};
    const pid = assignments[normalized];
    if (pid) {
      const p = this.store.config.partitions.find((x) => x.id === pid);
      if (p) return p.name;
    }
    const rule = firstMatch(entry.name, this.store.config.rules);
    return rule ? rule.partitionName : null;
  }

  /** 某分区的条目列表（置顶优先，再按名称） */
  listPartition(partition) {
    if (!this.desktopPath) return [];
    const pins = partition.pins || [];
    const isCatchAll = partition.isCatchAll || partition.name === '未分类';
    return this.collectEntries(this.desktopPath)
      .filter((e) => {
        const name = this.partitionNameFor(e);
        // 兜底分区收纳所有规则/分配都不命中的文件（partitionNameFor 返回 null）
        return isCatchAll ? (name === null || name === partition.name) : name === partition.name;
      })
      .map((e) => ({ ...e, pinned: pins.includes(e.name) }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
      });
  }

  /** 一键整理：重算全部分组（不做任何移动），返回统计 */
  organizeOnce() {
    const entries = this.desktopPath ? this.collectEntries(this.desktopPath) : [];
    const catchAll = this.store.config.partitions.find((p) => p.isCatchAll);
    const catchAllName = (catchAll && catchAll.name) || '未分类';
    const byPartition = {};
    for (const e of entries) {
      const name = this.partitionNameFor(e) || catchAllName;
      byPartition[name] = (byPartition[name] || 0) + 1;
    }
    return { total: entries.length, byPartition };
  }

  /** 分组总览（设置窗口展示） */
  groupingOverview() {
    const parts = this.store.config.partitions.map((p) => ({ name: p.name, id: p.id, count: this.listPartition(p).length }));
    return { partitions: parts, total: this.collectEntries(this.desktopPath).length };
  }

  /**
   * 拖入分区：把文件分配到指定分区。
   * 已在桌面根目录的文件 → 只写分配表；外部文件 → 先移动进桌面再分配。
   */
  assignTo(partition, filePaths) {
    if (!this.desktopPath) return { assigned: 0, moved: 0 };
    const assignments = this.store.config.assignments || (this.store.config.assignments = {});
    let assigned = 0, moved = 0;
    for (const src of filePaths) {
      const full = path.normalize(src);
      if (path.dirname(full).toLowerCase() === this.desktopPath.toLowerCase()) {
        assignments[full] = partition.id;
        this._removeExcluded(full);
        assigned++;
      } else if (fs.existsSync(full)) {
        // 外部文件：移入桌面根目录再分配（用户主动拖入，属于预期内的移动）
        const dest = this._uniqueIn(full, this.desktopPath);
        try {
          fs.renameSync(full, dest);
        } catch (e) {
          try { fs.cpSync(full, dest, { recursive: true }); fs.rmSync(full, { recursive: true, force: true }); } catch (e2) { continue; }
        }
        const normalized = path.normalize(dest);
        assignments[normalized] = partition.id;
        this._removeExcluded(normalized);
        assigned++; moved++;
      }
    }
    this.store.saveConfig();
    return { assigned, moved };
  }

  /** 移出分区：取消分配并把文件归入排除表（不再按规则归类，进未分类） */
  unassign(filePath) {
    const assignments = this.store.config.assignments;
    if (assignments) delete assignments[path.normalize(filePath)];
    const excluded = this.store.config.excluded || (this.store.config.excluded = []);
    if (!excluded.includes(path.normalize(filePath))) excluded.push(path.normalize(filePath));
    this.store.saveConfig();
  }

  /** 分区间重新分配 */
  reassignBetween(partition, filePath, targetPartition) {
    if (!targetPartition || targetPartition.id === partition.id) return 0;
    const assignments = this.store.config.assignments || (this.store.config.assignments = {});
    const normalized = path.normalize(filePath);
    assignments[normalized] = targetPartition.id;
    this._removeExcluded(normalized);
    this.store.saveConfig();
    return 1;
  }

  _removeExcluded(normalized) {
    const excluded = this.store.config.excluded;
    if (!excluded) return;
    const i = excluded.indexOf(normalized);
    if (i >= 0) excluded.splice(i, 1);
  }

  /** 分区内删除文件后清理置顶标记 */
  clearPin(partition, filePath) {
    if (!partition.pins) partition.pins = [];
    const i = partition.pins.indexOf(path.basename(filePath));
    if (i >= 0) partition.pins.splice(i, 1);
    this.store.saveConfig();
  }

  /** 移入目录时唯一化文件名 */
  _uniqueIn(srcPath, destDir) {
    const ext = path.extname(srcPath);
    const base = path.basename(srcPath, ext);
    let candidate = path.join(destDir, path.basename(srcPath));
    let i = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(destDir, `${base} (${i})${ext}`);
      i++;
    }
    return candidate;
  }
}

module.exports = Organizer;
