import type { AppSettings } from "@/core/models";

const FONT_SIZES = { normal: "16px", large: "17.5px", extra: "19px" } as const;

/**
 * 将设置应用到 document 根元素：
 * data-theme 选主题、.dark 类切深色、data-accent 选强调色、
 * data-decorations 控制装饰、color-scheme 让原生控件跟随、
 * fontSize 调整界面字号（模块 19 #9，全站 rem 随之缩放）。
 * 由 settingsStore 订阅触发，幂等可重复调用。
 */
export function applyTheme(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = settings.themeId;
  root.dataset.accent = settings.accent;
  root.dataset.decorations = settings.decorations ? "on" : "off";
  root.style.fontSize = FONT_SIZES[settings.fontSize] ?? "16px";

  const dark =
    settings.mode === "dark" ||
    (settings.mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** 监听系统明暗变化（mode = "system" 时需要重新应用主题）。返回取消监听函数。 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
