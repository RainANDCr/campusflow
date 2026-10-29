# CampusFlow

**为中国大学生设计的跨平台智能课程表。** 准确处理教学周、单双周、调课补课；本地优先、离线可用；一套代码构建 Web / PWA / Windows / macOS / Android / iOS。

> 状态：**v1 八阶段 + v2 模块化提示词八个阶段（18 模块）全部完成**。196 个单元测试全绿，功能逐项对照见 [docs/FEATURES.md](docs/FEATURES.md)，更新记录见 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

## 🌐 在线使用（无需安装）

**👉 https://rainandcr.github.io/campusflow/**

打开即用，数据保存在本机；支持"安装"为 PWA 应用（手机/桌面均可），离线可用。

## 📦 下载

| 平台 | 获取方式 |
| --- | --- |
| 浏览器 / PWA | 直接访问上方网站，浏览器菜单里点"安装应用" |
| **Windows** | [Releases 页面](https://github.com/RainANDCr/campusflow/releases) 下载 `CampusFlow_x64-setup.exe`（含系统托盘、开机自启、系统级通知） |
| Android / iOS | 使用浏览器 PWA；原生壳工程已就绪（见 [打包指南](docs/PACKAGING.md)），APK/IPA 需对应平台工具链构建 |

## 📖 使用说明

**完全不懂技术？看这里 → [使用说明（小白版）](docs/USER-GUIDE.md)**：从打开网页开始手把手教你创建学期、添加课程、设置提醒、备份换机，附名词词典与常见问题 FAQ。

## 快速开始（开发者）

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器
npm test           # 运行单元测试（Vitest，196 个）
npm run build      # 类型检查 + 生产构建（含 PWA，输出 dist/）
npm run preview    # 本地预览生产构建
```

环境要求：Node.js ≥ 20.19（开发验证：Node 24 / npm 11 / Windows 11）。

## 打包与部署

详见 [docs/PACKAGING.md](docs/PACKAGING.md)。速查：

```bash
npm run tauri:build   # Windows EXE + NSIS 安装包（需 Rust）
npm run cap:sync      # 同步 web 到 android/ 与 ios/（APK 需 Android Studio）
# GitHub Pages：push 到 main 自动构建部署（.github/workflows/deploy.yml）
# Cloudflare Pages：构建命令 npm run build，输出目录 dist
```

## 目录结构

```
src/
├── core/            # 平台无关核心层
│   ├── models/      # 数据模型（TS 类型 + Zod schema，12 类实体）
│   ├── db/          # Dexie 数据库、仓库、备份/加密/WebDAV/AI 适配
│   ├── services/    # 教学周/周次规则/课程实例/冲突/提醒/导入导出/PNG 渲染/统计
│   └── platform/    # 平台适配层（通知：Web/Tauri/Capacitor）
├── stores/          # Zustand（设置、课表视图状态、撤销）
├── theme/           # 主题 CSS 变量（9 主题×明暗）+ 课程 12 色板
├── components/      # ui 基础件 / layout / schedule / agenda / data / system
├── pages/           # 课表 / 日程 / 统计 / 学期 / 设置
├── hooks/           # useSemesterData / useNow / useLongPress
└── test/            # 测试环境
docs/                # 架构 / 数据模型 / UI 规范 / 打包 / 使用说明 / 路线图 / 功能对照 / 更新日志
android/ ios/        # Capacitor 原生工程（cap add 生成）
src-tauri/           # Tauri 2 桌面工程（托盘/自启）
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | **使用说明（小白版）**：手把手教程 + 名词词典 + FAQ |
| [docs/PACKAGING.md](docs/PACKAGING.md) | 五端打包与部署指南（GitHub Pages / Cloudflare / Tauri / Capacitor） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术选型、分层架构、跨平台与存储策略 |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | 实体定义、字段约定、索引与迁移策略 |
| [docs/FEATURES.md](docs/FEATURES.md) | 18 模块 398 项功能逐项实现状态 |
| [docs/UI-DESIGN.md](docs/UI-DESIGN.md) | 设计方向、主题令牌、动效与无障碍规范 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 完整更新日志 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | v1 八阶段 + v2 八阶段进度 |
