import type { ClassTimeSlot, Course, CourseSession, ISODate } from "@/core/models";
import { getSlotTime } from "./schedule";
import { getDateForDay, getRawWeek, type WeekLike } from "./weekCalc";
import { weekRuleContains } from "./weekRule";

/**
 * 时间感知的课次展开与冲突检测。
 * 与 conflict.ts 的“节次+周次集合”快速判定互补：
 * 这里把重复规则展开为【具体日期 + 实际时刻】的课次（CourseOccurrence 的时间维度），
 * 冲突采用半开区间 [start, end)：相邻课程（上一节结束 = 下一节开始）不算冲突。
 */

export interface TimedOccurrence {
  /** 稳定 key：sessionId@date */
  key: string;
  sessionId: string;
  courseId: string;
  courseName: string;
  date: ISODate;
  dayOfWeek: number;
  /** 由节次配置映射的实际时刻（节次缺失的安排不参与时间冲突判定） */
  startTime: string;
  endTime: string;
  startSlot: number;
  endSlot: number;
}

/** 半开区间重叠判定。 */
export function timeIntervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function resolveTimes(
  slots: ClassTimeSlot[],
  startSlot: number,
  endSlot: number,
): { startTime: string; endTime: string } | null {
  const startTime = getSlotTime(slots, startSlot, "start");
  const endTime = getSlotTime(slots, endSlot, "end");
  if (!startTime || !endTime) return null;
  return { startTime, endTime };
}

/**
 * 把一条重复规则展开为 [rangeStart, rangeEnd] 内的具体课次。
 * 周次判定与课表渲染共用同一套 resolveWeeks 规则，保证结果一致。
 */
export function expandSessionToTimes(params: {
  session: CourseSession;
  course: Course;
  semester: WeekLike & { totalWeeks: number };
  slots: ClassTimeSlot[];
  rangeStart: ISODate;
  rangeEnd: ISODate;
}): TimedOccurrence[] {
  const { session, course, semester, slots, rangeStart, rangeEnd } = params;
  if (rangeEnd < rangeStart) return [];
  const firstWeek = Math.max(1, getRawWeek(semester, rangeStart));
  const lastWeek = Math.min(semester.totalWeeks, getRawWeek(semester, rangeEnd));
  const out: TimedOccurrence[] = [];
  for (let week = firstWeek; week <= lastWeek; week++) {
    if (!weekRuleContains(session.weekRule, week, semester.totalWeeks)) continue;
    const date = getDateForDay(semester, week, session.dayOfWeek);
    if (date < rangeStart || date > rangeEnd) continue;
    const times = resolveTimes(slots, session.startSlot, session.endSlot);
    if (!times) continue;
    out.push({
      key: `${session.id}@${date}`,
      sessionId: session.id,
      courseId: course.id,
      courseName: course.name,
      date,
      dayOfWeek: session.dayOfWeek,
      startTime: times.startTime,
      endTime: times.endTime,
      startSlot: session.startSlot,
      endSlot: session.endSlot,
    });
  }
  return out;
}

export interface TimeConflict {
  aKey: string;
  bKey: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * 在一组已展开课次中找出时间冲突（同一天 × 半开区间相交）。
 * 泛型入参以兼容带额外字段的出现对象；O(n²) 按天分组后规模很小。
 */
export function findTimeConflicts<
  T extends { key: string; date: string; startTime: string; endTime: string },
>(occurrences: T[]): TimeConflict[] {
  const byDate = new Map<string, T[]>();
  for (const occ of occurrences) {
    const arr = byDate.get(occ.date) ?? [];
    arr.push(occ);
    byDate.set(occ.date, arr);
  }
  const out: TimeConflict[] = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (!a || !b) continue;
        // 按开始时间排序后：a.start <= b.start；只要 a.end > b.start 即重叠（半开区间）
        if (timeIntervalsOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
          out.push({
            aKey: a.key,
            bKey: b.key,
            date,
            startTime: b.startTime,
            endTime: a.endTime > b.endTime ? b.endTime : a.endTime,
          });
        }
      }
    }
  }
  return out;
}
