import { z } from "zod";

export const THEME_IDS = [
  "cream",
  "sakura",
  "sky",
  "forest",
  "starry",
  "mono",
  "cyber",
  "pixel",
  "autumn",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  cream: "奶油白",
  sakura: "樱花粉",
  sky: "天空蓝",
  forest: "森林绿",
  starry: "深夜星空",
  mono: "极简黑白",
  cyber: "科技赛博",
  pixel: "像素风",
  autumn: "秋叶橘",
};

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export const ACCENT_IDS = [
  "amber",
  "rose",
  "blue",
  "green",
  "violet",
  "orange",
  "cyan",
  "pink",
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export const ACCENT_LABELS: Record<AccentId, string> = {
  amber: "琥珀",
  rose: "玫红",
  blue: "钴蓝",
  green: "青绿",
  violet: "堇紫",
  orange: "橘橙",
  cyan: "湖蓝",
  pink: "桃粉",
};

/** 课程卡片信息密度（模块 02 #19）。 */
export const CARD_DENSITIES = ["compact", "standard", "relaxed"] as const;
export type CardDensity = (typeof CARD_DENSITIES)[number];

export const CARD_DENSITY_LABELS: Record<CardDensity, string> = {
  compact: "紧凑",
  standard: "标准",
  relaxed: "宽松",
};

/** 通知静音时段（模块 05 #16）：窗口内的提醒顺延到结束时刻。 */
export interface QuietHours {
  enabled: boolean;
  /** "HH:mm" */
  start: string;
  /** "HH:mm" */
  end: string;
}

/** 应用级偏好设置（存于 preferences 表，key = "app"）。 */
export interface AppSettings {
  themeId: ThemeId;
  mode: ThemeMode;
  accent: AccentId;
  /** 轻二次元装饰开关（樱花 / 星空等，默认关闭） */
  decorations: boolean;
  /** 课表是否显示周末列 */
  showWeekend: boolean;
  /** 是否显示下节课倒计时卡片 */
  showCountdown: boolean;
  /** 课程卡片信息密度 */
  cardDensity: CardDensity;
  /** 卡片是否显示教室 */
  cardShowRoom: boolean;
  /** 卡片是否显示教师 */
  cardShowTeacher: boolean;
  /** 下课提醒（模块 05 #3） */
  endOfClassReminder: boolean;
  /** 今日第一节课程摘要提醒（模块 05 #5），提前 60 分钟 */
  firstClassSummary: boolean;
  /** 周末上课提醒开关（模块 05 #17） */
  weekendReminder: boolean;
  /** 通知静音时段（模块 05 #16） */
  quietHours: QuietHours;
  /** 界面字号（模块 19 #9） */
  fontSize: "normal" | "large" | "extra";
  /** 当前激活学期（学期切换时更新） */
  activeSemesterId?: string;
  /** 当前激活课表方案（多套课表切换） */
  activeProfileId?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: "cream",
  mode: "system",
  accent: "blue",
  decorations: false,
  showWeekend: true,
  showCountdown: true,
  cardDensity: "standard",
  cardShowRoom: true,
  cardShowTeacher: true,
  endOfClassReminder: false,
  firstClassSummary: false,
  weekendReminder: true,
  quietHours: { enabled: false, start: "23:00", end: "07:00" },
  fontSize: "normal",
};

export const zAppSettings = z.object({
  themeId: z.enum(THEME_IDS),
  mode: z.enum(THEME_MODES),
  accent: z.enum(ACCENT_IDS),
  decorations: z.boolean(),
  showWeekend: z.boolean(),
  showCountdown: z.boolean(),
  cardDensity: z.enum(CARD_DENSITIES),
  cardShowRoom: z.boolean(),
  cardShowTeacher: z.boolean(),
  endOfClassReminder: z.boolean(),
  firstClassSummary: z.boolean(),
  weekendReminder: z.boolean(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
  fontSize: z.enum(["normal", "large", "extra"]),
  activeSemesterId: z.string().min(1).optional(),
  activeProfileId: z.string().min(1).optional(),
});

/** preferences 表中的一条记录。value 为 JSON 值，按 key 读取时再校验。 */
export interface PreferenceRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** 偏好设置在表中的主键。 */
export const PREF_KEY_SETTINGS = "app";
