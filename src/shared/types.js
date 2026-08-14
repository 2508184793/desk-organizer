'use strict';

// 数据结构约定（供主进程与渲染进程参考）

/**
 * 分区（一个悬浮面板窗口 + 一个绑定文件夹）
 * {
 *   id: string,
 *   name: string,          // 分区名，也是桌面\整理\ 下文件夹名
 *   folder: string,        // 该分区绑定的真实文件夹绝对路径
 *   x, y, width, height,   // 窗口位置与大小(DIP)
 *   color: string,         // 主题强调色
 *   opacity: number,       // 背景不透明度 0~1
 *   rounded: boolean,      // 圆角
 *   collapsed: boolean,    // 是否收起(仅显示标题栏)
 *   pins: string[],        // 置顶项：相对 folder 的文件名
 *   locked: boolean        // 锁定后不可拖动/缩放
 * }
 */

/**
 * 规则
 * {
 *   id, name,
 *   matchType: 'ext' | 'keyword' | 'regex',
 *   patterns: string[],        // ext: ['.docx','.pdf']；keyword: ['合同','方案']；regex: ['...']
 *   partitionName: string,     // 归入的分区名(文件夹名)
 *   priority: number           // 越小越先匹配
 * }
 */

/**
 * 整理快照(用于撤销)
 * { origPath, destPath, movedAt }
 */

/**
 * 分区内的一个条目(返回给渲染进程)
 * {
 *   name, path, isDir,
 *   iconUrl: string|null,   // dzicon:// 自定义协议，可显示真实图标
 *   iconFallback: string,   // 取不到图标时的 emoji
 *   pinned: boolean
 * }
 */

// 文件类型 -> emoji 兜底映射
const TYPE_EMOJI = {
  '.doc': '📄', '.docx': '📄', '.pdf': '📕', '.txt': '📝', '.md': '📝',
  '.xls': '📊', '.xlsx': '📊', '.ppt': '📽', '.pptx': '📽',
  '.jpg': '🖼', '.jpeg': '🖼', '.png': '🖼', '.gif': '🖼', '.bmp': '🖼', '.webp': '🖼', '.svg': '🖼',
  '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.aac': '🎵',
  '.mp4': '🎬', '.avi': '🎬', '.mkv': '🎬', '.mov': '🎬', '.wmv': '🎬',
  '.zip': '📦', '.rar': '📦', '.7z': '📦', '.tar': '📦', '.gz': '📦',
  '.exe': '⚙️', '.msi': '⚙️', '.bat': '⚙️', '.cmd': '⚙️',
  '.lnk': '🔗', '.url': '🔗',
  '.html': '🌐', '.htm': '🌐', '.css': '🎨', '.js': '🧩', '.json': '🧾',
  '.txt~': '📄',
};

// 默认分区模板（首次启动时创建）
const DEFAULT_PARTITIONS = [
  { name: '文档', color: '#4c8bf5' },
  { name: '图片', color: '#31b15f' },
  { name: '视频', color: '#e06c00' },
  { name: '音乐', color: '#c2408f' },
  { name: '压缩包', color: '#8a5cf6' },
  { name: '软件', color: '#1ba1c9' },
  { name: '快捷方式', color: '#6c7a89' },
  { name: '未分类', color: '#a0a0a0' },
];

// 默认规则（优先级 0~7，越小越先）
const DEFAULT_RULES = [
  { name: '文档', matchType: 'ext', patterns: ['.doc', '.docx', '.pdf', '.txt', '.md', '.xls', '.xlsx', '.ppt', '.pptx', '.wps', '.et', '.dps'], partitionName: '文档' },
  { name: '图片', matchType: 'ext', patterns: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff'], partitionName: '图片' },
  { name: '视频', matchType: 'ext', patterns: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'], partitionName: '视频' },
  { name: '音乐', matchType: 'ext', patterns: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg'], partitionName: '音乐' },
  { name: '压缩包', matchType: 'ext', patterns: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso'], partitionName: '压缩包' },
  { name: '软件', matchType: 'ext', patterns: ['.exe', '.msi', '.bat', '.cmd'], partitionName: '软件' },
  { name: '快捷方式', matchType: 'ext', patterns: ['.lnk', '.url'], partitionName: '快捷方式' },
];

module.exports = { TYPE_EMOJI, DEFAULT_PARTITIONS, DEFAULT_RULES };
