import { addDays, differenceInCalendarWeeks, parseISO, startOfWeek } from "date-fns";
import type { ISODate, WeekStartsOn } from "@/core/models";
import { toISODate } from "@/lib/date";

/** 教学周计算所需的学期字段。 */
export interface WeekLike {
  weekOneAnchor: ISODate;
  totalWeeks: number;
  weekStartsOn: WeekStartsOn;
}

export type SemesterWeekInfo =
  | { phase: "before" }
  | { phase: "teaching"; week: number }
  | { phase: "after" };

/**
 * 根据开学日期推算第一周锚点（开学日期所在周的第一天）。
 * 例：2026-09-01（周二）→ weekStartsOn=1 时为 2026-08-31（周一）。
 */
export function computeWeekOneAnchor(
  startDate: ISODate,
  weekStartsOn: WeekStartsOn,
): ISODate {
  return toISODate(startOfWeek(parseISO(startDate), { weekStartsOn }));
}

/**
 * 计算某日期所在的教学周（不裁剪范围，可为 0/负数/超过总周数）。
 * 供假期期间的补课等场景使用。
 */
export function getRawWeek(s: WeekLike, date: ISODate): number {
  return (
    differenceInCalendarWeeks(parseISO(date), parseISO(s.weekOneAnchor), {
      weekStartsOn: s.weekStartsOn,
    }) + 1
  );
}

/**
 * 计算某日期所在的教学周。
 * 单双周以此教学周序号为准（而非自然日历周）。
 */
export function getWeekInfo(s: WeekLike, date: ISODate): SemesterWeekInfo {
  const week = getRawWeek(s, date);
  if (week < 1) return { phase: "before" };
  if (week > s.totalWeeks) return { phase: "after" };
  return { phase: "teaching", week };
}

/** 某教学周的 7 个日期，按用户设定的每周起始日排列。 */
export function getWeekDates(s: WeekLike, week: number): ISODate[] {
  const start = addDays(parseISO(s.weekOneAnchor), (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

/**
 * 教学周中某 dayOfWeek（1=周一…7=周日）对应的日期。
 * 与 weekStartsOn 无关：始终以该周的实际星期换算。
 */
export function getDateForDay(
  s: WeekLike,
  week: number,
  dayOfWeek: number,
): ISODate {
  const weekStart = addDays(parseISO(s.weekOneAnchor), (week - 1) * 7);
  // 该周周一的日期：若每周起始日为周日，周一 = 周起始日 + 1 天
  const monday = addDays(weekStart, s.weekStartsOn === 1 ? 0 : 1);
  return toISODate(addDays(monday, dayOfWeek - 1));
}

/** 课表列的显示顺序（dayOfWeek 数组）：周一优先或周日优先。 */
export function orderedDaysOfWeek(weekStartsOn: WeekStartsOn): number[] {
  return weekStartsOn === 1
    ? [1, 2, 3, 4, 5, 6, 7]
    : [7, 1, 2, 3, 4, 5, 6];
}

/** 教学周的范围描述："8.31 - 9.6" */
export function formatWeekRange(dates: ISODate[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";
  const [fs, fe] = [first.split("-"), last.split("-")];
  const fm = fs[1];
  const fd = fs[2];
  const lm = fe[1];
  const ld = fe[2];
  if (!fm || !fd || !lm || !ld) return "";
  const from = `${Number(fm)}.${Number(fd)}`;
  const to = `${Number(lm)}.${Number(ld)}`;
  return Number(fm) === Number(lm) ? `${from} - ${Number(ld)}` : `${from} - ${to}`;
}
