# CampusFlow 打包与部署指南

## 概览

| 目标 | 技术 | 产物 | 本机状态 |
| --- | --- | --- | --- |
| 网站部署 | Cloudflare Pages | `dist/` | ✅ 构建通过，配置就绪 |
| PWA 安装 | vite-plugin-pwa | `dist/sw.js` + manifest | ✅ 构建通过 |
| Windows | Tauri 2 | `src-tauri/target/release/campusflow.exe` + NSIS 安装包 | 见下文构建说明 |
| Android | Capacitor | `android/` 工程 → APK | 工程已生成，APK 需 Android SDK |
| iOS / macOS | Capacitor / Xcode | `ios/` 工程 | 工程已生成，构建需 macOS + Xcode |

## 0. 通用前置

```bash
npm install
npm run build     # 产物输出到 dist/（含 PWA service worker）
```

## 1. Cloudflare Pages 部署

方式 A（推荐，Git 集成）：
1. 把仓库推送到 GitHub/GitLab 并在 Cloudflare Dashboard 创建 Pages 项目；
2. 构建命令 `npm run build`，输出目录 `dist`；
3. 其余（SPA 路由、缓存）无需额外配置 —— 应用使用 Hash 路由，`public/_headers` 已提供缓存策略。

方式 B（直传）：
```bash
npm run build
npx wrangler pages deploy dist
```

PWA：部署后用浏览器访问，地址栏会出现“安装”按钮；安装后离线可用（Service Worker 预缓存全部静态资源）。

## 2. Windows EXE（Tauri 2）

前置：Rust 工具链（rustup，MSVC target）+ WebView2（Win11 自带）。

```bash
npm run tauri:build
# 产物：
#   src-tauri/target/release/campusflow.exe         （单文件可执行）
#   src-tauri/target/release/bundle/nsis/*-setup.exe（NSIS 安装包）
```

开发调试：`npm run tauri:dev`（热更新窗口）。

说明：
- 窗口尺寸、标识符、打包目标都在 `src-tauri/tauri.conf.json`（当前 targets 为 nsis，可加 `msi`）。
- WebView2 内的 Web 通知会被系统渲染为 Windows 通知，设置页授权后生效。
- 桌面增强（托盘、开机自启）为可选后续项：Tauri 官方 tray API 已在依赖内可用，按需在 `src-tauri/src/lib.rs` 添加。

## 3. Android APK（Capacitor）

前置：Android Studio（含 SDK 35+）与 JDK 17。本机已装 JDK 17，但未配置 Android SDK，因此无法在本机直接出包。

```bash
npm run cap:sync                 # 构建 web + 同步到 android/ 与 ios/
# 打开 Android Studio 打开 android/ 目录，或命令行：
cd android && ./gradlew assembleDebug     # 调试 APK
cd android && ./gradlew assembleRelease   # 需先配置签名（build.gradle）
# 产物：android/app/build/outputs/apk/
```

- 应用 ID：`com.campusflow.app`（capacitor.config.ts）。
- 通知：已接入 `@capacitor/local-notifications`，真机上按设置页提示授权即可。

## 4. iOS / macOS

前置：macOS + Xcode 15+（Windows 环境无法完成原生构建 —— `ios/` 工程已生成，仅能在 mac 上编译）。

```bash
npm run cap:sync
npx cap open ios     # 在 macOS 上打开 Xcode → 签名 → Product > Run / Archive
```

macOS 桌面应用建议用 Tauri：在 mac 上执行 `npm run tauri:build`（bundle targets 加 `dmg`、`app`），图标可先用 `npx @tauri-apps/cli icon public/icons/icon-512.png` 重新生成全套。

## 5. 图标

`public/icons/` 与 `src-tauri/icons/` 中的图标由 `scripts/gen-icons.ps1` 生成（PowerShell + System.Drawing）。替换品牌图标时：改脚本设计 → 重新生成 → `npm run cap:sync` 同步到原生工程。

## 6. 平台能力对照

| 能力 | Web/PWA | Windows (Tauri) | Android/iOS (Capacitor) |
| --- | --- | --- | --- |
| 课程表全部功能 | ✅ | ✅ | ✅ |
| 本地数据（IndexedDB） | ✅ | ✅（WebView2 持久化） | ✅ |
| 上课/考试提醒 | ✅（应用打开期间） | ✅（系统通知） | ✅（本地通知，可后台） |
| 导出 PNG / PDF | ✅ | ✅ | ✅ |
| 离线使用 | ✅（SW 预缓存） | ✅ | ✅ |
