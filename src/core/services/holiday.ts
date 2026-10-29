import type {
  ClassTimeSlot,
  Course,
  CourseException,
  CourseSession,
  ISODate,
  Semester,
} from "@/core/models";
import { applyExceptions, buildInstancesForWeek } from "./schedule";
import { getRawWeek, getWeekDates } from "./weekCalc";

/**
 * 节假日批量调整（模块 04 #11）：把日期范围内受影响的课次计划为「停课」例外。
 * 不修改原始重复规则；产生的 cancel 例外可在变更记录中整批撤销（删除即恢复）。
 */

export interface PlannedCancel {
  sessionId: string;
  courseId: string;
  originalDate: ISODate;
  /** 受影响课程名（用于预览与提醒文案） */
  courseName: string;
}

/** 已经停课的 sessionId@date 集合，避免重复计划。 */
function existingCancelKeys(exceptions: CourseException[]): Set<string> {
  const set = new Set<string>();
  for (const e of exceptions) {
    if (e.kind === "cancel") set.add(`${e.sessionId}@${e.originalDate}`);
    if (e.kind === "adjust" && e.newDate && e.newDate !== e.originalDate) {
      // 已调走的原课次同样不需要再停
      set.add(`${e.sessionId}@${e.originalDate}`);
    }
  }
  return set;
}

/**
 * 计算日期范围内将被批量停课的课次（预览）。
 * 展开逻辑与课表渲染共用同一 occurrence 引擎，保证“看到什么停什么”。
 */
export function planHolidayCancels(params: {
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  rangeStart: ISODate;
  rangeEnd: ISODate;
}): PlannedCancel[] {
  const { semester, slots, courses, sessions, exceptions, rangeStart, rangeEnd } = params;
  if (rangeEnd < rangeStart) return [];
  const cancelKeys = existingCancelKeys(exceptions);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // 覆盖范围内的教学周逐周展开
  const firstWeek = Math.max(1, getRawWeek(semester, rangeStart));
  const lastWeek = Math.min(semester.totalWeeks, getRawWeek(semester, rangeEnd));
  const out: PlannedCancel[] = [];
  for (let week = firstWeek; week <= lastWeek; week++) {
    const dates = getWeekDates(semester, week);
    const base = buildInstancesForWeek(semester, week, { courses, sessions, slots });
    const instances = applyExceptions(dates, base, exceptions, courseById, slots);
    for (const inst of instances) {
      if (inst.date < rangeStart || inst.date > rangeEnd) continue;
      if (inst.variant === "cancelled" || inst.variant === "moved-away") continue;
      if (inst.sessionId === "") continue; // 补课实例不由节假日批量停课删除
      const key = `${inst.sessionId}@${inst.date}`;
      if (cancelKeys.has(key)) continue;
      cancelKeys.add(key);
      const course = courseById.get(inst.courseId);
      if (!course) continue;
      out.push({
        sessionId: inst.sessionId,
        courseId: inst.courseId,
        originalDate: inst.date,
        courseName: course.name,
      });
    }
  }
  return out.sort((a, b) => a.originalDate.localeCompare(b.originalDate));
}
