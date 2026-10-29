import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadAppSettings, saveAppSettings } from "@/core/db/preferences";
import { DEFAULT_SETTINGS, type AppSettings } from "@/core/models";

/**
 * 应用设置存储。
 * 数据流：IndexedDB（preferences 表）为权威来源；
 * localStorage（zustand persist，key = campusflow.settings）仅作启动缓存，
 * 供 index.html 内联脚本在 React 挂载前应用主题、避免闪烁。
 */
interface SettingsState {
  settings: AppSettings;
  /** 是否已完成从 IndexedDB 的水合 */
  hydrated: boolean;
  update: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      hydrated: false,
      update: (patch) => {
        const next: AppSettings = { ...get().settings, ...patch };
        set({ settings: next });
        // 写穿到 IndexedDB；失败不阻塞 UI（localStorage 缓存仍在）
        void saveAppSettings(next).catch((err: unknown) => {
          console.warn("[campusflow] 保存偏好设置失败", err);
        });
      },
    }),
    {
      name: "campusflow.settings",
      version: 1,
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { settings?: Partial<AppSettings> };
        return {
          ...current,
          settings: { ...current.settings, ...p.settings },
        };
      },
    },
  ),
);

/** 应用启动时调用：以 IndexedDB 中的权威设置覆盖本地缓存。 */
export async function hydrateSettingsFromDb(): Promise<void> {
  try {
    const stored = await loadAppSettings();
    if (stored) useSettingsStore.setState({ settings: stored });
  } catch (err) {
    console.warn("[campusflow] 读取偏好设置失败，使用本地缓存", err);
  } finally {
    useSettingsStore.setState({ hydrated: true });
  }
}
