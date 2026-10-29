/** 应用运行时平台。 */
export type RuntimePlatform = "web" | "tauri" | "capacitor";

/**
 * 探测当前运行环境。
 * - Tauri 2 桌面端注入 __TAURI_INTERNALS__
 * - Capacitor 注入全局 Capacitor 对象
 * - 其余（浏览器 / Cloudflare Pages / PWA）视为 web
 */
export function detectPlatform(): RuntimePlatform {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) return "tauri";
  if (w.Capacitor) return "capacitor";
  return "web";
}

export const platform: RuntimePlatform = detectPlatform();
