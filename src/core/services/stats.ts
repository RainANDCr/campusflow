import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { slotsForDay } from "./slots";
import { applyExceptions, buildInstancesForWeek, type CourseInstance } from "./schedule";
import { getRawWeek, getWeekDates } from "./weekCalc";
import { todayISO } from "@/lib/date";

/**
 * 课程统计引擎（模块 14）：全部指标由 occurrence 引擎派生，
 * 与课表所见一致（含停课/调课/补课），纯函数可测。
 */

export interface DayHistogram {
  /** dayOfWeek 1-7 → 课次数 */
  byDay: Record<number, number>;
  /** 每教学周课次数（1..totalWeeks） */
  byWeek: number[];
}

export interface TimSplit {
  morning: number;
  afternoon: number;
  evening: number;
  earlyFirst: number;
}

export interface CourseStat {
  courseId: string;
  name: string;
  /** 学期内总节数（含补课，扣除停课/调走） */
  slotsTotal: number;
  weeks: number[];
}

export interface SemesterStats {
  totalCourses: number;
  /** 学期总课时（节数） */
  totalSlots: number;
  /** 已结束教学周比例（0-1） */
  completedWeekRatio: number;
  currentWeek: number | null;
  histograms: DayHistogram;
  timeSplit: TimSplit;
  perCourse: CourseStat[];
  /** 调课/停课/补课次数 */
  adjustCount: number;
  cancelCount: number;
  extraCount: number;
  /** 剩余课次（今天起，含今天未结束的） */
  remainingOccurrences: number;
  busiestDay: number | null;
  freestDay: number | null;
}

/** 展开整个学期的课次（含例外；排除 moved-away 占位）。 */
export function expandSemesterOccurrences(
  semester: Semester,
  slots: ClassTimeSlot[],
  courses: Course[],
  sessions: CourseSession[],
  exceptions: CourseException[],
): CourseInstance[] {
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const out: CourseInstance[] = [];
  for (let week = 1; week <= semester.totalWeeks; week++) {
    const dates = getWeekDates(semester, week);
    const base = buildInstancesForWeek(semester, week, { courses, sessions, slots });
    for (const inst of applyExceptions(dates, base, exceptions, courseById, slots)) {
      if (inst.variant === "moved-away") continue;
      out.push(inst);
    }
  }
  return out;
}

function minutesOf(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** 计算学期统计。nowDate 用于教学进度与剩余课次。 */
export function computeSemesterStats(params: {
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  nowDate?: string;
}): SemesterStats {
  const { semester, slots, courses, sessions, exceptions } = params;
  const nowDate = params.nowDate ?? todayISO();
  const all = expandSemesterOccurrences(semester, slots, courses, sessions, exceptions);
  const active = all.filter((i) => i.variant !== "cancelled");

  const byDay: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const byWeek = new Array<number>(semester.totalWeeks).fill(0);
  const timeSplit: TimSplit = { morning: 0, afternoon: 0, evening: 0, earlyFirst: 0 };
  const slotTotals = new Map<string, number>();

  for (const inst of active) {
    byDay[inst.dayOfWeek] = (byDay[inst.dayOfWeek] ?? 0) + 1;
    const week = getRawWeek(semester, inst.date);
    if (week >= 1 && week <= semester.totalWeeks) byWeek[week - 1] = (byWeek[week - 1] ?? 0) + 1;

    if (inst.startTime && inst.endTime) {
      const start = minutesOf(inst.startTime);
      if (start < 12 * 60) timeSplit.morning += 1;
      else if (start < 18 * 60) timeSplit.afternoon += 1;
      else timeSplit.evening += 1;
      if (inst.startSlot === 1) timeSplit.earlyFirst += 1;
    }
    slotTotals.set(inst.courseId, (slotTotals.get(inst.courseId) ?? 0) + (inst.endSlot - inst.startSlot + 1));
  }

  const perCourse: CourseStat[] = courses
    .map((c) => ({
      courseId: c.id,
      name: c.name,
      slotsTotal: slotTotals.get(c.id) ?? 0,
      weeks: [
        ...new Set(
          active.filter((i) => i.courseId === c.id).map((i) => getRawWeek(semester, i.date)),
        ),
      ]
        .filter((w) => w >= 1 && w <= semester.totalWeeks)
        .sort((a, b) => a - b),
    }))
    .sort((a, b) => b.slotsTotal - a.slotsTotal);

  const weekInfo = getRawWeek(semester, nowDate);
  const currentWeek = weekInfo >= 1 && weekInfo <= semester.totalWeeks ? weekInfo : null;
  const completedWeekRatio =
    currentWeek === null ? (weekInfo < 1 ? 0 : 1) : (currentWeek - 1) / semester.totalWeeks;

  const remainingOccurrences = active.filter((i) => i.date >= nowDate).length;
  const adjustCount = exceptions.filter((e) => e.kind === "adjust").length;
  const cancelCount = exceptions.filter((e) => e.kind === "cancel").length;
  const extraCount = exceptions.filter((e) => e.kind === "extra").length;

  const dayValues = [1, 2, 3, 4, 5, 6, 7].map((d) => byDay[d] ?? 0);
  const maxDay = Math.max(...dayValues);
  const minDay = Math.min(...dayValues);
  const busiestDay = maxDay > 0 ? dayValues.indexOf(maxDay) + 1 : null;
  const freestDay = minDay < maxDay ? dayValues.indexOf(minDay) + 1 : null;

  return {
    totalCourses: courses.length,
    totalSlots: active.reduce((n, i) => n + (i.endSlot - i.startSlot + 1), 0),
    completedWeekRatio,
    currentWeek,
    histograms: { byDay, byWeek },
    timeSplit,
    perCourse,
    adjustCount,
    cancelCount,
    extraCount,
    remainingOccurrences,
    busiestDay,
    freestDay,
  };
}

/** 早八/晚课判定说明：早八 = 第一节开始的课次；晚课 = 开始时间 ≥ 18:00。 */
export function isNightSlot(allSlots: ClassTimeSlot[], dayOfWeek: number, index: number): boolean {
  const s = slotsForDay(allSlots, dayOfWeek).find((x) => x.index === index);
  return s ? minutesOf(s.startTime) >= 18 * 60 : false;
}
