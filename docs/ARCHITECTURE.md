# CampusFlow 架构设计

## 1. 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| UI 框架 | React 19 + TypeScript（严格模式） | 生态成熟，类型安全，shadcn/ui 生态契合 |
| 构建 | Vite 7 | 冷启动快，单配置支撑 Web/打包多目标 |
| 样式 | Tailwind CSS 4 | 原子化 + CSS 变量主题，天然支持运行时换肤 |
| 组件 | shadcn/ui 风格手写基础件（cva + tailwind-merge） | 组件源码在仓库内，可深度定制课程卡片等特殊组件 |
| 动效 | Framer Motion | 声明式动画，内置 `reducedMotion="user"` 支持 |
| 状态 | Zustand | 轻量、无样板代码、可在组件外订阅（主题应用） |
| 存储 | Dexie 4（IndexedDB）+ Zod 校验 | 大容量结构化存储、索引查询、版本迁移机制 |
| 日期 | date-fns 4（zh-CN locale） | 按需引入、树摇友好，周起始日可配置 |
| 测试 | Vitest + fake-indexeddb | 与 Vite 同源；DB 测试无需浏览器 |
| 跨平台 | Capacitor（Android/iOS）+ Tauri 2（Windows/macOS） | 第七阶段接入，共享同一 dist 产物 |

刻意未引入：后端、账号体系、云服务（第一版离线优先）；路由库使用 react-router（HashRouter）。

## 2. 分层架构

```
┌─────────────────────────────────────────────────┐
│ pages/（课表 / 日程 / 学期 / 设置）                │  ← 路由页面
├─────────────────────────────────────────────────┤
│ components/（ui 基础件、layout 骨架、业务组件）     │  ← 展示层
├─────────────────────────────────────────────────┤
│ stores/（Zustand：设置、UI 状态）                 │  ← 状态层
├─────────────────────────────────────────────────┤
│ core/services/（教学周计算、周次规则、冲突检测…）   │  ← 业务逻辑（纯函数，可测）
├─────────────────────────────────────────────────┤
│ core/db/（Dexie + 仓库函数）  core/models/（类型+Zod）│  ← 数据层
├─────────────────────────────────────────────────┤
│ core/platform/（适配器接口 → Web/Tauri/Capacitor 实现）│  ← 平台适配层
└─────────────────────────────────────────────────┘
```

规则：
- `core/` 不依赖 React 与 DOM（除 platform/detect 需 window 探测），全部可单元测试。
- UI 组件不直接写库；通过 services / stores 访问数据。
- 平台特有能力（通知、文件保存、小组件）只依赖 `core/platform/types.ts` 的接口，实现按运行时注入（`detectPlatform()` 返回 `web | tauri | capacitor`）。
- UI 与业务分离：课程卡片的渲染数据由 services 层算出（给定学期 + 周 → 该周的上课实例列表），组件只负责展示。

## 3. 跨平台策略

同一套 Web 构建（`dist/`）被多个壳复用：

| 目标 | 方案 | 阶段 |
| --- | --- | --- |
| 网站与 PWA | Cloudflare Pages 静态托管 + manifest/Service Worker | 第七阶段 |
| Windows / macOS | Tauri 2（系统 WebView，产物小） | 第七阶段 |
| Android / iOS | Capacitor（原生壳 + 本地通知插件） | 第七阶段 |

- 路由使用 **HashRouter**：同一产物无需服务器重写规则即可在上述所有环境工作（Cloudflare Pages 免 `_redirects`，Tauri/Capacitor 的非 http 协议也不受影响）。
- iOS/macOS 构建依赖 macOS + Xcode，Windows 环境只能生成工程，届时如实说明。

## 4. 数据与状态方案

- **权威存储**：IndexedDB（Dexie）。所有实体写入前经 Zod 校验（`parse` 抛错 / 仓库层拦截）。
- **设置的双层设计**：
  - `preferences` 表（key=`app`）是权威来源，随 JSON 备份导出；
  - zustand `persist` 写 localStorage 作为启动缓存，`index.html` 内联脚本在 React 挂载前读取它应用主题，**避免首屏闪烁**；启动后 `hydrateSettingsFromDb()` 用权威数据覆盖。
- **派生状态**（当前周、某周的课程实例、下节课倒计时）不落库，由 services 实时计算，避免一致性维护。
- **迁移策略**：Dexie `version(n)` 声明式升级；破坏性形状变更必须写 `upgrade()`，且 `DB_SCHEMA_VERSION` 记入备份元信息，导入旧备份时可执行迁移。

## 5. 错误处理与边界（贯穿各阶段）

- 数据写入统一走 Zod：非法数据被拒并给出中文字段错误。
- IndexedDB 不可用（隐私模式等）：设置回退 localStorage 缓存；页面给出可理解的提示而不是白屏。
- 单平台能力缺失（如 Web 端通知被拒）：适配器返回失败状态，UI 降级提示，不影响其他功能。
- 时区：全部日期为本地日历日字符串（yyyy-MM-dd），无 UTC 换算问题；跨时区使用时按"日历日"语义解释。

## 6. 测试策略

- 单元测试（Vitest）：models 校验、weekCalc、weekRule、db 读写（fake-indexeddb）。
- 阶段结束时必须 `npm test` + `npm run build` 全绿。
- 核心流程端到端（Playwright，第八阶段）：建学期 → 录课 → 切周 → 调课。
- 手工冒烟：本阶段已用内置浏览器验证首屏渲染、主题切换、持久化恢复。
