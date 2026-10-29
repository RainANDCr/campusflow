import type { Course, CourseSession, WeekRule } from "@/core/models";
import { weekRuleLabel } from "./weekRule";

/**
 * 极简 CSV 引擎：支持 RFC 4180 引号转义、逗号/换行、\r\n 与 \n。
 * 第一行视为表头。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // 去 BOM
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      // 引号内的 CRLF 规范化为 LF
      if (ch === "\r" && src[i + 1] === "\n") {
        field += "\n";
        i += 2;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/** 周次规则 → 人类可读文本（导出用）。 */
function ruleToText(rule: WeekRule): string {
  return weekRuleLabel(rule)
    .replace("每周", "全部")
    .replace("第 ", "")
    .replace(" 周", "周");
}

/** 周次文本 → 规则（导入用）："全部/每周"、"单周"、"双周"、"1-8周"、"1、3、5周"、"1,3,5" 等。 */
export function parseWeekRuleText(text: string, totalWeeks: number): WeekRule | null {
  const t = text.trim().replace(/\s/g, "");
  if (!t) return null;
  if (/^(全部|每周|全周|all)$/i.test(t)) return { type: "all" };
  if (/^(单周|单|odd)$/i.test(t)) return { type: "odd" };
  if (/^(双周|双|even)$/i.test(t)) return { type: "even" };
  const range = t.match(/^第?(\d+)\s*[-~－至到]\s*(\d+)周?$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from && to && from <= to) return { type: "range", from, to };
  }
  const nums = t.match(/\d+/g);
  if (nums && nums.length > 0) {
    const weeks = nums
      .map(Number)
      .filter((w) => w >= 1 && w <= Math.max(totalWeeks, 60));
    if (weeks.length > 0) return { type: "custom", weeks: [...new Set(weeks)] };
  }
  return null;
}

/** 星期文本 → 1-7："周一/星期一/一/Mon/1"。 */
export function parseDayOfWeekText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const num = Number(t);
  if (Number.isInteger(num) && num >= 1 && num <= 7) return num;
  const lower = t.toLowerCase();
  const en = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  for (const [idx, prefix] of en.entries()) {
    if (lower.startsWith(prefix)) return idx + 1;
  }
  const cn = t.replace(/^(周|星期)/, "").charAt(0);
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return map[cn] ?? null;
}

export interface CourseCsvMeta {
  course: Course;
  sessions: CourseSession[];
}

const CSV_HEADERS = [
  "课程名称",
  "教师",
  "教学楼",
  "教室",
  "星期",
  "开始节次",
  "结束节次",
  "周次",
  "课程类型",
  "颜色",
  "图标",
  "备注",
] as const;

/** 课程清单数据行（CSV 与 XLSX 导出共用）。 */
export function exportCoursesRows(list: CourseCsvMeta[]): string[][] {
  const rows: string[][] = [[...CSV_HEADERS]];
  for (const { course, sessions } of list) {
    if (sessions.length === 0) {
      rows.push([
        course.name, course.teacher ?? "", course.building ?? "", course.room ?? "",
        "", "", "", "全部", course.type, course.color, course.icon ?? "", course.note ?? "",
      ]);
      continue;
    }
    for (const s of sessions) {
      rows.push([
        course.name,
        s.teacher ?? course.teacher ?? "",
        s.building ?? course.building ?? "",
        s.room ?? course.room ?? "",
        `周${["一", "二", "三", "四", "五", "六", "日"][s.dayOfWeek - 1]}`,
        String(s.startSlot),
        String(s.endSlot),
        ruleToText(s.weekRule),
        course.type,
        course.color,
        course.icon ?? "",
        course.note ?? "",
      ]);
    }
  }
  return rows;
}

/** 导出课程清单（每行 = 一条上课安排）。 */
export function exportCoursesCsv(list: CourseCsvMeta[]): string {
  return "\uFEFF" + rowsToCsv(exportCoursesRows(list)); // BOM：Excel 打开不乱码
}

/** 表头 → 列号的自动猜测映射。 */
export function guessColumnMapping(header: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const patterns: Record<string, RegExp> = {
    name: /(课程|课名|名称|name|subject|course)/i,
    teacher: /(教师|老师|授课|teacher|instructor)/i,
    building: /(楼|校区|building|campus)/i,
    room: /(教室|地点|room|location|place)/i,
    day: /(星期|周|礼拜|day|weekday)/i,
    startSlot: /(开始节|起始节|节次开始|start.*节|节.*start)/i,
    endSlot: /(结束节|节次结束|end.*节|节.*end)/i,
    weeks: /(周次|周|weeks?)/i,
    type: /(类型|type)/i,
    color: /(颜色|color)/i,
    note: /(备注|note|remark)/i,
  };
  for (const [field, re] of Object.entries(patterns)) {
    const idx = header.findIndex((h) => re.test(h.trim()));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

export interface MappedCourseDraft {
  name: string;
  teacher?: string;
  building?: string;
  room?: string;
  type: Course["type"];
  color: string;
  icon?: string;
  note?: string;
  dayOfWeek: number | null;
  startSlot: number | null;
  endSlot: number | null;
  weekRule: WeekRule | null;
  /** 无法解析的行会带原因 */
  error?: string;
}

export interface CsvImportMapping {
  name: number | undefined;
  teacher: number | undefined;
  building: number | undefined;
  room: number | undefined;
  day: number | undefined;
  startSlot: number | undefined;
  endSlot: number | undefined;
  weeks: number | undefined;
  type: number | undefined;
  color: number | undefined;
  note: number | undefined;
}

/** 按映射把数据行转换为课程草稿（每行 = 一个安排；同名相邻行合并为一门课）。 */
export function mapCsvRows(
  dataRows: string[][],
  mapping: CsvImportMapping,
  totalWeeks: number,
  defaultColor = "sky",
): MappedCourseDraft[] {
  const out: MappedCourseDraft[] = [];
  for (const row of dataRows) {
    const cell = (idx: number | undefined): string =>
      idx === undefined ? "" : (row[idx] ?? "").trim();
    const name = cell(mapping.name);
    if (!name) {
      out.push({
        name: "", type: "lecture", color: defaultColor,
        dayOfWeek: null, startSlot: null, endSlot: null, weekRule: null,
        error: "缺少课程名称",
      });
      continue;
    }
    const dayText = cell(mapping.day);
    const startText = cell(mapping.startSlot);
    const endText = cell(mapping.endSlot);
    const weeksText = cell(mapping.weeks);
    const day = dayText ? parseDayOfWeekText(dayText) : 1;
    const start = startText ? Number(startText) : null;
    const end = endText ? Number(endText) : (start ?? null);
    const typeText = cell(mapping.type).toLowerCase();
    const type = (["lecture", "lab", "sport", "seminar", "elective", "online"].find(
      (t) => t === typeText,
    ) ?? "lecture") as Course["type"];
    out.push({
      name,
      teacher: cell(mapping.teacher) || undefined,
      building: cell(mapping.building) || undefined,
      room: cell(mapping.room) || undefined,
      type,
      color: cell(mapping.color) || defaultColor,
      note: cell(mapping.note) || undefined,
      dayOfWeek: day,
      startSlot: start,
      endSlot: end,
      weekRule: parseWeekRuleText(weeksText, totalWeeks) ?? { type: "all" },
      error:
        day === null
          ? "无法识别星期"
          : start === null || !Number.isInteger(start) || start < 1
            ? "无法识别开始节次"
            : undefined,
    });
  }
  return out;
}
