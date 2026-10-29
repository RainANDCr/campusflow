import { ISO_DATE_PATTERN, type ISODate } from "@/core/models";
import { format, isValid, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

/** Date → "yyyy-MM-dd"（本地时区）。 */
export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

/** "yyyy-MM-dd" → 本地时区零点的 Date。 */
export function fromISODate(s: ISODate): Date {
  return parseISO(s);
}

/** 校验 ISO 日期字符串（同时拒绝 2026-02-30 这类格式正确但不存在的日期）。 */
export function isValidISODate(s: string): boolean {
  if (!ISO_DATE_PATTERN.test(s)) return false;
  const d = parseISO(s);
  return isValid(d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDaysISO(s: ISODate, days: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** 星期几，1 = 周一 … 7 = 周日（ISO 约定）。 */
export function dayOfWeekOf(s: ISODate): number {
  const day = parseISO(s).getDay();
  return day === 0 ? 7 : day;
}

/** 展示用长日期："2026年10月28日 星期三" */
export function formatDisplayDate(s: ISODate): string {
  return format(parseISO(s), "yyyy年M月d日 EEEE", { locale: zhCN });
}

/** 展示用短日期："10月28日" */
export function formatShortDate(s: ISODate): string {
  return format(parseISO(s), "M月d日");
}
