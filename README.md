# 桌面整理助手

用 Electron 开发的 Windows 桌面分区收纳与整理工具。

![Electron](https://img.shields.io/badge/Electron-43-blue) ![Platform](https://img.shields.io/badge/Platform-Windows-0078d6)

## 功能

- **虚拟分区**：文件原地不动，分区只是按「规则 + 分配表」计算的视觉分组，不产生任何文件夹
- **自定义分区**：桌面上悬浮的圆角半透明收纳盒，可拖动、缩放、换色、调透明度、收起
- **规则引擎自动归类**：新文件出现在桌面自动归入对应分区（按后缀 / 文件名关键字 / 正则）
- **图标操作**：置顶（★）、删除（回收站）、重命名、打开所在文件夹、移出分区
- **拖入即归组**：把文件拖进某个分区盒子，即写入分配表归入该分区（文件仍在桌面原处）；手动归组永不参与自动整理
- **自动接管桌面**：启动即隐藏系统图标（退出自动恢复，可手动关闭），桌面由分区面板完整接管
- **零移动、零风险**：文件路径永远不变，无需撤销/恢复

## 快速开始

```bash
npm install
npm start
```

> 国内安装 Electron 时，`.npmrc` 已配置 npmmirror 镜像；若安装后 `node_modules/electron/dist` 缺失，
> 可执行 `node node_modules/electron/install.js` 或手动从镜像下载 zip 解压。

## 打包

```bash
npm run dist      # 生成 NSIS 安装包（dist/）
npm run pack      # 仅生成免安装目录
```

## 目录结构

```
src/
├─ main/          主进程：store / rules / organizer / watcher / icons / shell / desktop / native / windowManager
├─ preload/       安全桥接（contextBridge）
├─ renderer/      界面：partition/ 分区面板 · settings/ 设置窗口
└─ shared/        IPC 通道与数据结构常量
scripts/          PowerShell 图标提取脚本（UTF-8 文件传参，避免中文路径乱码）
assets/           应用/托盘图标
```

## 设计要点

- **虚拟分区**：分区内容由「规则引擎 + 分配表(assignments) + 排除表(excluded)」即时计算，桌面目录一有变化就刷新，
  文件永不移动，不产生任何文件夹
- **窗口置底**：每个分区是一个透明无边框 BrowserWindow，用 koffi（N-API FFI）调 `SetWindowPos(HWND_BOTTOM)`
  压到壁纸之上、普通窗口之下；koffi 不可用时自动回退 PowerShell P/Invoke
- **高 DPI 拖动**：150% 等分数缩放下 Electron `setPosition` 会让透明窗口每帧变宽，分区移动改走原生
  `SetWindowPos(SWP_NOSIZE)`（物理像素坐标），缩放用 `setSize`
- **系统图标开关**：给桌面 `SHELLDLL_DefView` 发 `WM_COMMAND(0x7402)`（与桌面右键「显示桌面图标」同一命令），
  比注册表 HideIcons + SHChangeNotify 可靠（新 Win11 上后者会闪回复现）
- **真实图标**：PowerShell `System.Drawing.Icon::ExtractAssociatedIcon` 提取，按扩展名/路径哈希缓存为 PNG，
  通过自定义 `dzicon://` 协议加载；目录图标共用共享键、提取失败不再重试
- **零移动零风险**：拖入分区 = 写分配表；移出分区 = 进排除表（归入未分类）。系统隐藏文件（desktop.ini 等）不参与分组
- **打包**：`scripts/` 需 `asarUnpack` 解包（PowerShell 无法运行 asar 内的 .ps1）

## 隔离测试

```bash
# 指向临时目录做隔离测试，避免操作真实桌面
DZ_DESKTOP=C:/tmp/fake-desktop npm start
```

## 手动验证清单

- [ ] `npm start` 启动后出现 8 个默认分区面板 + 设置窗口
- [ ] 桌面放几个测试文件 → 自动按规则归入对应分区，文件原地未动、无新文件夹
- [ ] 新文件拖到桌面 → 自动归入对应分区
- [ ] 把文件拖进某分区盒子 → 归入该分区（分配表持久化）；右键「移出分区」→ 回到未分类
- [ ] 分区拖动 / 缩放 / 换色 / 圆角 / 收起，重启后位置与收起状态保留
- [ ] 启动后系统桌面图标自动隐藏，托盘退出后恢复；设置里手动切换后退出保持现状
- [ ] 一键整理只重排未手动分组的文件，手动拖入分区的保持不动
- [ ] 设置 → 分组总览 显示当前归组统计
