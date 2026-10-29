import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 配置（Android / iOS 壳）。
 * webDir 指向 Vite 构建产物；流程：npm run build → npx cap sync → 原生 IDE 打包。
 */
const config: CapacitorConfig = {
  appId: "com.campusflow.app",
  appName: "CampusFlow",
  webDir: "dist",
  backgroundColor: "#faf7f1",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
