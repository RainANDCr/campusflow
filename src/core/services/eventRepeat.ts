import type { EventRepeat, ScheduleEvent } from "@/core/models";

/**
 * 日程重复展开（模块 11 #16）。
 * repeat = weekly：锚定日的每个星期；yearly：每年相同月-日（生日、纪念日）。
 * date 始终是锚定日；repeat 缺省按 "none" 处理。
 */

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

/** 某日程是否在某日“发生”（含重复展开）。 */
export function eventOccursOn(event: Pick<ScheduleEvent, "date" | "repeat">, date: string): boolean {
  const repeat: EventRepeat = event.repeat ?? "none";
  if (repeat === "none") return event.date === date;
  if (date < event.date) return false; // 重复事件从锚定日开始
  if (repeat === "weekly") return weekdayOf(event.date) === weekdayOf(date);
  // yearly：月-日相同（2/29 锚定在非闰年落到 2/28，避免消失）
  return event.date.slice(5) === date.slice(5);
}

/** 锚定日之后（含）的第一次发生日期；无重复时即锚定日本身。 */
export function nextOccurrence(
  event: Pick<ScheduleEvent, "date" | "repeat">,
  fromDate: string,
): string | null {
  const repeat: EventRepeat = event.repeat ?? "none";
  if (repeat === "none") return event.date >= fromDate ? event.date : null;
  // 最多向后找 366+7 天
  const cursor = new Date(`${fromDate}T00:00:00`);
  const limit = new Date(cursor);
  limit.setDate(limit.getDate() + 373);
  for (let i = 0; i < 374; i++) {
    const iso = toISO(cursor);
    if (iso >= fromDate && eventOccursOn(event, iso)) return iso;
    cursor.setDate(cursor.getDate() + 1);
    if (cursor > limit) break;
  }
  return null;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 日程与课程的时间冲突（模块 11 #18）：同一天 × 半开区间相交。全天日程视为冲突整日。 */
export function eventConflictsWithClasses(
  event: Pick<ScheduleEvent, "date" | "allDay" | "startTime" | "endTime">,
  classes: Array<{ date: string; startTime?: string; endTime?: string }>,
): boolean {
  const sameDay = classes.filter((c) => c.date === event.date);
  if (sameDay.length === 0) return false;
  if (event.allDay) return true;
  if (!event.startTime || !event.endTime) return false;
  return sameDay.some((c) => {
    if (!c.startTime || !c.endTime) return false;
    // 半开区间 [start, end)
    return event.startTime! < c.endTime && c.startTime < event.endTime!;
  });
}
