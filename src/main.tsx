import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "@/App";
import { runAutoBackupIfNeeded } from "@/core/db/autoBackup";
import { hydrateSettingsFromDb, useSettingsStore } from "@/stores/settingsStore";
import { applyTheme, watchSystemTheme } from "@/theme/applyTheme";
import "@/theme/theme.css";

// 主题应用：订阅设置变化 + 跟随系统明暗切换（幂等）
useSettingsStore.subscribe((state) => applyTheme(state.settings));
watchSystemTheme(() => {
  const { settings } = useSettingsStore.getState();
  if (settings.mode === "system") applyTheme(settings);
});

// 以 IndexedDB 中的权威设置覆盖启动缓存（异步，不阻塞首屏）
void hydrateSettingsFromDb().then(() => {
  // 自动定期本地备份（模块 17 #4）：距上次超过 24 小时生成快照，仅存本机
  void runAutoBackupIfNeeded();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
