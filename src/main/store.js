'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_PARTITIONS, DEFAULT_RULES } = require('../shared/types');

/**
 * 持久化层：config.json（分区/规则/分配表/设置），原子写入（先写临时文件再 rename）。
 * 虚拟分区模型：文件永不移动，分区按「规则 + 分配表」计算桌面文件归属。
 */
class Store {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.configPath = path.join(userDataDir, 'config.json');
    this.config = null;
  }

  /** 初始化：读取或创建默认配置（含旧版本迁移） */
  init() {
    this._ensureDir(this.userDataDir);
    this.config = this._readJson(this.configPath, null);
    this.firstRun = !this.config; // 首次启动标记（用于决定是否弹设置窗口）
    if (!this.config || this.config.version !== 2) {
      const oldSettings = this.config ? this.config.settings : null;
      const oldRules = this.config ? this.config.rules : null;
      this.config = this._defaultConfig();
      if (oldSettings) this.config.settings = oldSettings;
      if (oldRules && Array.isArray(oldRules)) this.config.rules = oldRules;
      this.saveConfig();
    }
    return this.config;
  }

  _defaultConfig() {
    return {
      version: 2,
      partitions: DEFAULT_PARTITIONS.map((p, i) => this._makePartition(p, i)),
      rules: DEFAULT_RULES.map((r, i) => ({ ...r, id: 'rule-' + (i + 1), priority: i + 1 })),
      assignments: {}, // 拖入分区的显式指定：{ 绝对路径: 分区id }，优先于规则
      excluded: [],    // 被移出分区的文件（不再按规则归类，归入未分类）
      settings: { iconsHidden: false, autoHideIcons: true, autoStart: false, showOnLaunch: true },
    };
  }

  _makePartition(p, i) {
    const baseLeft = 40 + (i % 4) * 300;
    const baseTop = 40 + Math.floor(i / 4) * 280;
    return {
      id: 'part-' + Date.now().toString(36) + '-' + i,
      name: p.name,
      isCatchAll: p.name === '未分类', // 兜底分区：规则/分配都不命中的文件都归它
      x: baseLeft, y: baseTop, width: 270, height: 260,
      color: p.color, opacity: 0.55, rounded: true, collapsed: false,
      pins: [], locked: false,
    };
  }

  saveConfig() {
    this._writeJson(this.configPath, this.config);
  }

  _readJson(file, fallback) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { console.error('读取配置失败', file, e.message); }
    return fallback;
  }

  _writeJson(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = Store;
