'use strict';

const path = require('path');

/**
 * 规则引擎：根据文件名匹配分区。
 * matchType:
 *   'ext'     -> patterns 是扩展名数组，如 ['.docx','.pdf']（含点，忽略大小写）
 *   'keyword' -> patterns 是关键字数组，文件名包含任一即命中
 *   'regex'   -> patterns 是正则字符串数组
 */

function matchRule(itemName, rule) {
  if (!rule || !rule.patterns || rule.patterns.length === 0) return false;
  const lower = itemName.toLowerCase();
  switch (rule.matchType) {
    case 'ext': {
      const ext = path.extname(itemName).toLowerCase();
      return rule.patterns.some((p) => p.toLowerCase() === ext);
    }
    case 'keyword':
      return rule.patterns.some((kw) => kw && lower.includes(kw.toLowerCase()));
    case 'regex':
      return rule.patterns.some((rx) => {
        try { return new RegExp(rx, 'i').test(itemName); } catch { return false; }
      });
    default:
      return false;
  }
}

/** 按优先级返回第一条命中的规则，无则 null */
function firstMatch(itemName, rules) {
  const sorted = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const r of sorted) {
    if (matchRule(itemName, r)) return r;
  }
  return null;
}

module.exports = { matchRule, firstMatch };
