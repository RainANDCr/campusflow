import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { applyExceptions, buildInstancesForWeek } from "./schedule";
import { getWeekDates } from "./weekCalc";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function icsDateTime(date: string, time: string): string {
  const [h, m] = time.split(":");
  return `${date.replace(/-/g, "")}T${h}${m}00`;
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545：每行最多 75 字节（按 UTF-8 简化处理，按 24 个字符折叠以保险）
  if (line.length <= 60) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 60));
  rest = rest.slice(60);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 56)}`);
    rest = rest.slice(56);
  }
  return chunks.join("\r\n");
}

/**
 * 导出整学期课程表为 ICS 日历。
 * 将重复规则展开为逐日 VEVENT（含调课/停课/补课结果），任何日历软件都能正确导入。
 * 时间使用浮动本地时间（无时区后缀），与用户本地日历语义一致。
 */
export function buildSemesterIcs(
  semester: Semester,
  courses: Course[],
  sessions: CourseSession[],
  slots: ClassTimeSlot[],
  exceptions: CourseException[],
): string {
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusFlow//Timetable//CN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + icsEscape(semester.name),
  ];

  for (let week = 1; week <= semester.totalWeeks; week++) {
    const weekDates = getWeekDates(semester, week);
    const base = buildInstancesForWeek(semester, week, { courses, sessions, slots });
    const instances = applyExceptions(weekDates, base, exceptions, courseById, slots);
    for (const inst of instances) {
      if (inst.variant === "cancelled" || inst.variant === "moved-away") continue;
      if (!inst.startTime || !inst.endTime) continue;
      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${inst.key}@campusflow`));
      const stamp = new Date();
      lines.push(
        `DTSTAMP:${stamp.getUTCFullYear()}${pad2(stamp.getUTCMonth() + 1)}${pad2(stamp.getUTCDate())}T${pad2(stamp.getUTCHours())}${pad2(stamp.getUTCMinutes())}${pad2(stamp.getUTCSeconds())}Z`,
      );
      lines.push(`DTSTART:${icsDateTime(inst.date, inst.startTime)}`);
      lines.push(`DTEND:${icsDateTime(inst.date, inst.endTime)}`);
      lines.push(foldLine(`SUMMARY:${icsEscape(inst.courseName)}`));
      const location = [inst.building, inst.room].filter(Boolean).join(" · ");
      if (location) lines.push(foldLine(`LOCATION:${icsEscape(location)}`));
      if (inst.teacher) lines.push(foldLine(`DESCRIPTION:${icsEscape("教师：" + inst.teacher)}`));
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export interface IcsEventDraft {
  title: string;
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  note?: string;
}

function parseIcsDate(value: string): { date: string; time?: string } {
  // 20261012 → 2026-10-12；20261012T083000 → + 08:30
  const clean = value.trim();
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if (!m) return { date: "" };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] && m[5]) {
    return { date, time: `${m[4]}:${m[5]}` };
  }
  return { date };
}

/**
 * 解析 ICS 文本为日程草稿（用于导入为“重要日期/个人日程”）。
 * 宽容解析：忽略无法识别的行，解析失败的条目跳过。
 */
export function parseIcs(text: string): IcsEventDraft[] {
  const out: IcsEventDraft[] = [];
  const unfolded = text.replace(/\r?\n[ \t]+/g, ""); // 折行还原（吞掉续行全部空白）
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? "";
    const get = (prop: string): string | undefined => {
      const re = new RegExp(`^${prop}[^:]*:(.*)$`, "im");
      const m = body.match(re);
      return m?.[1]?.trim();
    };
    const summary = get("SUMMARY");
    const startRaw = get("DTSTART");
    if (!summary || !startRaw) continue;
    const start = parseIcsDate(startRaw);
    if (!start.date) continue;
    const endRaw = get("DTEND");
    const end = endRaw ? parseIcsDate(endRaw) : undefined;
    const allDay = start.time === undefined;
    const unescape = (v: string): string =>
      v.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
    const locationRaw = get("LOCATION");
    out.push({
      title: unescape(summary),
      date: start.date,
      allDay,
      startTime: allDay ? undefined : start.time,
      endTime: !allDay && end?.time ? end.time : undefined,
      note: locationRaw ? `地点：${unescape(locationRaw)}` : undefined,
    });
  }
  return out;
}
