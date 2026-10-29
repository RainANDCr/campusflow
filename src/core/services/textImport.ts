import type { MappedCourseDraft } from "./csv";
import { parseDayOfWeekText, parseWeekRuleText } from "./csv";

/**
 * 复制粘贴文本智能识别（模块 03 #10）与二维码分享载荷解析（模块 03 #23 的接收端）。
 * 启发式逐行解析常见课表文本，不调用任何网络服务。
 */

export interface ParsedTextCourse {
  name: string;
  dayOfWeek: number | null;
  startSlot: number | null;
  endSlot: number | null;
  weekRuleText: string;
  room?: string;
  teacher?: string;
  error?: string;
}

const SHARE_PREFIX = "campusflow-share:v1:";

function toDraft(p: ParsedTextCourse): MappedCourseDraft {
  return {
    name: p.name,
    teacher: p.teacher,
    room: p.room,
    type: "lecture",
    color: "sky",
    dayOfWeek: p.dayOfWeek,
    startSlot: p.startSlot,
    endSlot: p.endSlot ?? p.startSlot,
    weekRule: p.weekRuleText
      ? parseWeekRuleText(p.weekRuleText, 60) ?? { type: "all" }
      : { type: "all" },
    error: p.error,
  };
}

/** 从一行文本解析一门课的安排。 */
export function parseTimetableLine(line: string): ParsedTextCourse | null {
  const raw = line.trim();
  if (!raw || raw.startsWith("#")) return null;

  // 星期：优先 周X / 星期X（含数字星期），其次独立数字
  const dayCn = raw.match(/(?:星期|周)\s*([一二三四五六日天1-7])/);
  const dayDigit = dayCn ? null : raw.match(/(?<![周0-9\d])([1-7])(?![\d\-~－到至])/);
  const dayMarker = dayCn ?? dayDigit;
  const day = dayMarker
    ? parseDayOfWeekText(dayCn ? (dayCn[1] ?? "") : (dayDigit?.[1] ?? ""))
    : null;

  // 节次：N-M节（必须成对出现）
  const slotMatch = raw.match(/(\d{1,2})\s*[-~－到至]\s*(\d{1,2})\s*节?/);
  const startSlot = slotMatch ? Number(slotMatch[1]) : null;
  const endSlot = slotMatch ? Number(slotMatch[2]) : null;

  // 周次：中文词 / 带周字的区间 / 顿号列表
  const weekMatch = raw.match(
    /(全部|每周|单周|双周|\d{1,2}\s*[-~－到至]\s*\d{1,2}\s*周|\d{1,2}(?:[、,，]\s*\d{1,2})+\s*周?)/,
  );
  const weekText = weekMatch?.[1] ?? "";

  // 课程名：行首到第一个识别标记之间（标记位于行首说明没有课程名）；
  // 无任何标记时，去掉教室/教师标注后整行视为课程名
  const markerIndexes = [
    dayMarker?.index,
    slotMatch?.index,
    weekMatch?.index,
  ].filter((n): n is number => typeof n === "number");
  const firstMarker =
    markerIndexes.length > 0 ? Math.min(...markerIndexes) : undefined;

  // 教室：剔除已识别片段后，剩余 token 中含数字且含中文的
  let residue = raw;
  for (const m of [dayMarker, slotMatch, weekMatch]) {
    if (m) residue = residue.replace(m[0], " ");
  }
  const room = residue
    .split(/[\s,，;；/、]+/)
    .filter((t) => /\d/.test(t) && /[\u4e00-\u9fa5]/.test(t))
    .sort((a, b) => b.length - a.length)[0];

  let name: string;
  if (firstMarker !== undefined) {
    name = raw.slice(0, firstMarker).trim();
  } else {
    name = raw;
    if (room) name = name.replace(room, " ");
    name = name.replace(/(?:教师|老师)[:：].*$/, " ").trim();
  }
  name = name.replace(/^[;；,，、\s]+|[;；,，、\s]+$/g, "");

  // 教师：以「教师/老师：」标注
  const teacherMatch = raw.match(/(?:教师|老师)[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,8})/);
  const teacher = teacherMatch?.[1];

  if (!name) {
    return { name: "", dayOfWeek: day, startSlot, endSlot, weekRuleText: weekText, room, teacher, error: "未识别到课程名称" };
  }
  if (day === null) {
    return { name, dayOfWeek: null, startSlot, endSlot, weekRuleText: weekText, room, teacher, error: "未识别到星期" };
  }
  if (startSlot === null || !Number.isInteger(startSlot) || startSlot < 1) {
    return { name, dayOfWeek: day, startSlot: null, endSlot, weekRuleText: weekText, room, teacher, error: "未识别到节次" };
  }
  return { name, dayOfWeek: day, startSlot, endSlot, weekRuleText: weekText, room, teacher };
}

/** 多行文本解析；返回课程草稿（可直接进入导入预览流水线）。 */
export function parseTimetableText(text: string): MappedCourseDraft[] {
  return text
    .split(/\r?\n|;；/)
    .map((line) => parseTimetableLine(line))
    .filter((p): p is ParsedTextCourse => p !== null)
    .map(toDraft);
}

/** 二维码 / 分享文本载荷（模块 03 #23）。 */
export interface ShareCourse {
  n: string; // name
  d: number; // dayOfWeek
  s: number; // startSlot
  e: number; // endSlot
  w: unknown; // weekRule
  r?: string; // room
  t?: string; // teacher
}

export function buildSharePayload(
  entries: Array<{ name: string; dayOfWeek: number; startSlot: number; endSlot: number; weekRule: unknown; room?: string; teacher?: string }>,
): string {
  const payload = {
    app: "campusflow",
    v: 1,
    courses: entries.map<ShareCourse>((c) => ({
      n: c.name,
      d: c.dayOfWeek,
      s: c.startSlot,
      e: c.endSlot,
      w: c.weekRule,
      ...(c.room ? { r: c.room } : {}),
      ...(c.teacher ? { t: c.teacher } : {}),
    })),
  };
  const json = JSON.stringify(payload);
  // UTF-8 安全的 Base64
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return SHARE_PREFIX + b64;
}

export function isSharePayload(text: string): boolean {
  return text.trim().startsWith(SHARE_PREFIX);
}

/** 分享文本 → 课程草稿（导入端）。周规则以结构化数据传递。 */
export function parseSharePayload(text: string): MappedCourseDraft[] {
  const raw = text.trim();
  if (!raw.startsWith(SHARE_PREFIX)) return [];
  try {
    const bytes = Uint8Array.from(
      atob(raw.slice(SHARE_PREFIX.length)),
      (ch) => ch.charCodeAt(0),
    );
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      courses?: ShareCourse[];
    };
    return (parsed.courses ?? []).map((c) => ({
      name: c.n,
      teacher: c.t,
      room: c.r,
      type: "lecture" as const,
      color: "sky",
      dayOfWeek: c.d,
      startSlot: c.s,
      endSlot: c.e,
      weekRule: isWeekRule(c.w) ? c.w : { type: "all" as const },
      error: undefined,
    }));
  } catch {
    return [];
  }
}

function isWeekRule(v: unknown): v is MappedCourseDraft["weekRule"] {
  return typeof v === "object" && v !== null && "type" in v;
}

/** 统一入口：文本既可能是粘贴的课表文本，也可能是分享载荷。 */
export function parseAnyText(text: string): MappedCourseDraft[] {
  if (isSharePayload(text)) return parseSharePayload(text);
  return parseTimetableText(text);
}
