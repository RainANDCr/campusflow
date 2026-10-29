# CampusFlow

**为中国大学生设计的跨平台智能课程表。** 准确处理教学周、单双周、调课补课；本地优先、离线可用；一套代码构建 Web / PWA / Windows / macOS / Android / iOS。

> 状态：**v1 八阶段 + v2 模块化提示词八个阶段（18 模块）全部完成**。193 个单元测试全绿，功能逐项对照见 [docs/FEATURES.md](docs/FEATURES.md)，更新记录见 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

## 功能总览

- **课表核心**：周/日双视图、网格式课表、教学周切换（按钮/键盘/滑动）、单双周与指定周、当前课程高亮、已结束弱化、点击空白格快速建课
- **学期管理**：多学期独立课表、归档、切换、完全自定义节次时间与每周起始日
- **课程管理**：多上课时间、按周覆盖教师/教室、冲突检测、搜索、批量改色/删除、复制
- **调课补课**：临时调课/停课/补课（不动重复规则）、变更记录可编辑可撤销
- **日程**：考试（倒计时+提醒）、个人日程、课程待办、下节课倒计时卡片
- **通知**：Web / Windows(Tauri) / Android+iOS(Capacitor) 三级适配，全局+课程级提醒规则
- **导入导出**：JSON 备份恢复、CSV/XLSX 导入（字段映射+冲突预览）、CSV/ICS 导出、PNG 课表图、PDF 打印
- **体验**：6 主题×明暗×8 强调色即时切换、轻二次元装饰（花瓣/星空，可关）、Framer Motion 动效、响应式布局、安全区适配

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器
npm test           # 运行单元测试（Vitest，118 个）
npm run build      # 类型检查 + 生产构建（含 PWA，输出 dist/）
npm run preview    # 本地预览生产构建
```

环境要求：Node.js ≥ 20.19（开发验证：Node 24 / npm 11 / Windows 11）。

## 打包与部署

详见 [docs/PACKAGING.md](docs/PACKAGING.md)。速查：

```bash
npm run tauri:build   # Windows EXE + NSIS 安装包（需 Rust）
npm run cap:sync      # 同步 web 到 android/ 与 ios/（APK 需 Android Studio）
# Cloudflare Pages：构建命令 npm run build，输出目录 dist
```

## 目录结构

```
src/
├── core/            # 平台无关核心层
│   ├── models/      # 数据模型（TS 类型 + Zod schema，12 类实体）
│   ├── db/          # Dexie 数据库、仓库、备份恢复
│   ├── services/    # 教学周/周次规则/课程实例/冲突/提醒/导入导出/PNG 渲染
│   └── platform/    # 平台适配层（通知：Web/Tauri/Capacitor）
├── stores/          # Zustand（设置、课表视图状态）
├── theme/           # 主题 CSS 变量（6 主题×明暗）+ 课程 12 色板
├── components/      # ui 基础件 / layout / schedule / agenda / data / system
├── pages/           # 课表 / 日程 / 学期 / 设置
├── hooks/           # useSemesterData / useNow
└── test/            # 测试环境
docs/                # 架构 / 数据模型 / UI 规范 / 打包 / 使用说明 / 路线图
android/ ios/        # Capacitor 原生工程（cap add 生成）
src-tauri/           # Tauri 2 桌面工程
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | 使用说明（快速上手、调课补课、导入导出、快捷键） |
| [docs/PACKAGING.md](docs/PACKAGING.md) | 五端打包与部署指南 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术选型、分层架构、跨平台与存储策略 |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | 实体定义、字段约定、索引与迁移策略 |
| [docs/UI-DESIGN.md](docs/UI-DESIGN.md) | 设计方向、主题令牌、动效与无障碍规范 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 八阶段进度与已知问题 |
