import type { AccentId, ThemeId } from "@/core/models";

/** 主题元信息（供设置页选择器使用；实际颜色值定义在 theme.css）。 */
export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** 预览色板：背景 / 主色 / 点缀 */
  swatches: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  { id: "cream", name: "奶油白", swatches: ["#faf7f1", "#c2703d", "#f1ece2"] },
  { id: "sakura", name: "樱花粉", swatches: ["#fbf5f6", "#d25e82", "#f5e8eb"] },
  { id: "sky", name: "天空蓝", swatches: ["#f4f8fc", "#3b82f6", "#e9f0f8"] },
  { id: "forest", name: "森林绿", swatches: ["#f3f8f3", "#2f855a", "#e6f0e7"] },
  { id: "starry", name: "深夜星空", swatches: ["#0e0f1e", "#9b98ff", "#1e2040"] },
  { id: "mono", name: "极简黑白", swatches: ["#fafafa", "#26262b", "#e5e5e8"] },
  { id: "cyber", name: "科技赛博", swatches: ["#0d1117", "#00e5ff", "#1a232e"] },
  { id: "pixel", name: "像素风", swatches: ["#e8e8d8", "#5a8f29", "#d8d8c0"] },
  { id: "autumn", name: "秋叶橘", swatches: ["#faf4ec", "#d97706", "#f2e8d8"] },
];

export const ACCENTS: Array<{ id: AccentId; name: string; color: string }> = [
  { id: "amber", name: "琥珀", color: "#f59e0b" },
  { id: "rose", name: "玫红", color: "#f43f5e" },
  { id: "blue", name: "钴蓝", color: "#3b82f6" },
  { id: "green", name: "青绿", color: "#22c55e" },
  { id: "violet", name: "堇紫", color: "#8b5cf6" },
  { id: "orange", name: "橘橙", color: "#f97316" },
  { id: "cyan", name: "湖蓝", color: "#06b6d4" },
  { id: "pink", name: "桃粉", color: "#ec4899" },
];
