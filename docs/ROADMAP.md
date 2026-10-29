# CampusFlow 开发路线图

八阶段已全部完成（2026-10-28）。每阶段结束均运行 `npm test` + `npm run build` 并经浏览器实测。

## ✅ 第一阶段：需求、架构和工程初始化

Vite 7 + React 19 + TS 严格模式 + Tailwind 4；HashRouter 四页面；Zustand 设置存储（IndexedDB 权威 + localStorage 启动缓存）；Dexie schema v1 + 12 类实体 + Zod 校验；教学周/周次规则服务；6 主题×明暗×强调色主题系统。

## ✅ 第二阶段：课程表核心功能

学期管理（创建/编辑/归档/删除/切换激活）、课程 CRUD（多上课时间、周次规则编辑器）、周课表网格（跨节次卡片、重叠分道、今日高亮、进行中描边）、日视图、教学周切换、单双周与指定周、自定义节次时间、课程冲突检测（保存前警告 + 显式确认）。

## ✅ 第三阶段：高级课程管理

临时调课/停课/补课（CourseException 全流程，卡片形态：划除/已调走占位/调/补角标）、变更记录（列表/编辑/撤销）、课程复制、批量改色/删除、课程搜索、多学期管理。

## ✅ 第四阶段：日程和通知

考试管理（倒计时）、个人日程、课程待办、下节课倒计时卡片（可关闭）、通知平台适配层（Web Notification / Capacitor LocalNotifications / Tauri WebView）、全局+课程级提醒规则、24 小时前瞻调度器。

## ✅ 第五阶段：导入导出

JSON 备份恢复（合并/覆盖两种模式、逐条校验）、CSV 导出/导入、XLSX 导入（SheetJS 动态加载）、ICS 导出（整学期逐日展开含调课结果）/导入、PNG 课表图（Canvas 手绘、主题自适应）、PDF（打印样式优化）。

## ✅ 第六阶段：UI 与动画优化

装饰粒子层（浅色花瓣/深色星空，Canvas，尊重 prefers-reduced-motion）、切周方向滑动动画、触屏滑动手势（周视图切周/日视图切日）、桌面快捷键（←/→/T）、页面过渡与弹窗动画、深色模式全面适配。

## ✅ 第七阶段：跨平台打包

PWA（manifest + Workbox 预缓存，构建实测通过）、Capacitor Android/iOS 工程生成并同步（含原生本地通知插件）、**Tauri 2 Windows 构建实测通过**：`src-tauri/target/release/campusflow.exe`（启动验证通过）+ `bundle/nsis/CampusFlow_0.1.0_x64-setup.exe`（2.07 MiB 安装包）、Cloudflare Pages 配置（`_headers` 缓存策略）、应用图标生成脚本。

## ✅ 第八阶段：测试和交付

118 个单元测试（周次规则/教学周/课程实例/例外/冲突/通知/CSV/ICS/备份/模型校验/DB）、打包指南、用户手册、最终构建验证。

## 已知问题与后续可选项

- 主 JS 包 > 500 kB（framer-motion/dexie/zod/xlsx 未拆包）：功能完整，优化留作后续（manualChunks + 按需 import）。
- Android APK / iOS / macOS 原生构建需对应平台工具链（Android Studio / Xcode / macOS），工程与命令已就绪，见 docs/PACKAGING.md。
- 桌面托盘、开机自启、桌面小组件（Android Widget / iOS Widget）、云同步：架构已预留接口，未实现。
- Web 端提醒依赖应用运行（浏览器平台限制），桌面/移动端为系统级通知。
- 教务系统直连导入：按设计不做（避免假设各校页面结构），结构化文件导入向导已覆盖通用场景。
