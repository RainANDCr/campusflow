/** 课程配色板（12 色）。id 存入 Course.color；具体色值定义在 theme.css 的 --course-* 变量。 */
export const COURSE_COLORS = [
  { id: "rose", label: "玫瑰" },
  { id: "coral", label: "珊瑚" },
  { id: "amber", label: "琥珀" },
  { id: "lemon", label: "柠黄" },
  { id: "lime", label: "青柠" },
  { id: "emerald", label: "翠绿" },
  { id: "teal", label: "青绿" },
  { id: "sky", label: "天蓝" },
  { id: "blue", label: "钴蓝" },
  { id: "violet", label: "堇紫" },
  { id: "fuchsia", label: "品红" },
  { id: "graphite", label: "石墨" },
] as const;

export type CourseColorId = (typeof COURSE_COLORS)[number]["id"];

export const DEFAULT_COURSE_COLOR: CourseColorId = "sky";

export function isCourseColorId(v: string): v is CourseColorId {
  return COURSE_COLORS.some((c) => c.id === v);
}

/** 可选课程图标（emoji，存入 Course.icon，空字符串表示不使用）。 */
export const COURSE_ICONS = [
  "📐", "🧪", "💻", "🎨", "🎵", "⚽",
  "🌍", "⚖️", "🩺", "📖", "🔬", "🗣️",
  "🎭", "🧠", "⭐", "🈯",
] as const;
