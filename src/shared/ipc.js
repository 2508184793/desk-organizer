'use strict';

// 所有 IPC 通道名集中定义，避免主/渲染进程拼写不一致
module.exports = {
  // ---- 分区窗口 ----
  PARTITION_GET: 'partition:get',               // renderer->main 请求分区数据+内容
  PARTITION_REFRESH: 'partition:refresh',       // main->renderer 推送内容更新
  PARTITION_DROP_FILES: 'partition:drop-files', // renderer->main 外部文件拖入
  PARTITION_MOVE_OUT: 'partition:move-out',     // renderer->main 把文件移出分区(还原到桌面)
  PARTITION_UPDATE_CFG: 'partition:update-cfg', // renderer->main 保存窗口位置/大小/外观
  PARTITION_OPEN: 'partition:open',             // 打开文件/文件夹
  PARTITION_SHOW_IN_FOLDER: 'partition:show-in-folder',
  PARTITION_DELETE: 'partition:delete',         // 移入回收站
  PARTITION_RENAME: 'partition:rename',
  PARTITION_PIN: 'partition:pin',               // 置顶/取消置顶
  PARTITION_COLLAPSE: 'partition:collapse',     // 收起/展开
  PARTITION_CTX_MENU: 'partition:ctx-menu',     // 原生右键菜单（穿透卡片弹出）

  // ---- 设置窗口 ----
  OPEN_SETTINGS: 'open-settings',               // 分区内打开设置窗口
  SETTINGS_GET: 'settings:get',                 // 返回全部配置(分区/规则/设置)
  SETTINGS_SAVE: 'settings:save',
  PARTITION_ADD: 'partition:add',
  PARTITION_REMOVE: 'partition:remove',
  PARTITION_RENAME_THIS: 'partition:rename-this',
  RULES_SAVE: 'rules:save',
  ORGANIZE_RUN: 'organize:run',
  ORGANIZE_UNDO: 'organize:undo',
  ORGANIZE_HISTORY: 'organize:history',
  DESKTOP_ICONS_GET: 'desktop:icons-get',
  DESKTOP_ICONS_SET: 'desktop:icons-set',
  AUTO_HIDE_GET: 'pref:autohide-get',
  AUTO_HIDE_SET: 'pref:autohide-set',
  DESKTOP_SCREENS: 'desktop:screens',
  AUTOSTART_GET: 'autostart:get',
  AUTOSTART_SET: 'autostart:set',

  // ---- 全局事件 ----
  EVT_CONFIG_CHANGED: 'evt:config-changed',
  EVT_ORGANIZE_DONE: 'evt:organize-done',
};
