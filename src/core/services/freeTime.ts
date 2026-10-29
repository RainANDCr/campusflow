import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { freeSlotIndexes, slotsForDay } from "./slots";
import { applyExceptions, buildInstancesForWeek, type CourseInstance } from "./schedule";
import { getRawWeek, getWeekDates } from "./weekCalc";

/**
 * 空闲时间与多人课表对比（模块 12 本地部分：#1/#2/#3/#5/#6）。
 * 多人课表通过分享码/导入获得（只读比较，不与本人数据混合）；
 * 共同空闲 = 双方在该天有效作息中都未被占用的节次。
 * 在线协作/群组权限需真实服务端（模块 12 #15-22），此处明确不做。
 */

export interface TimetableInput {
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions?: CourseException[];
}

/** 展开某周某天一个人（或一份课表）的占用课次。 */
export function occurrencesForDate(
  input: TimetableInput,
  date: string,
): CourseInstance[] {
  const { semester, slots, courses, sessions, exceptions = [] } = input;
  const rawWeek = getRawWeek(semester, date);
  const weekDates = getWeekDates(semester, rawWeek);
  const base =
    rawWeek >= 1 && rawWeek <= semester.totalWeeks
      ? buildInstancesForWeek(semester, rawWeek, { courses, sessions, slots })
      : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));
  return applyExceptions(weekDates, base, exceptions, courseById, slots).filter(
    (i) => i.date === date,
  );
}

/** 单人某天的空闲节次区间（连续段 [from,to]）。 */
export function personalFreeRanges(
  input: TimetableInput,
  date: string,
): Array<[number, number]> {
  const occ = occurrencesForDate(input, date).filter(
    (i) => i.variant !== "cancelled" && i.variant !== "moved-away",
  );
  const dow = occ[0]?.dayOfWeek ?? (new Date(`${date}T00:00:00`).getDay() === 0 ? 7 : new Date(`${date}T00:00:00`).getDay());
  const effective = occ.length > 0 ? slotsForDay(input.slots, dow) : slotsForDay(input.slots, 1);
  return toRanges(freeSlotIndexes(occ, effective));
}

function toRanges(indexes: number[]): Array<[number, number]> {
  const sorted = [...indexes].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const idx of sorted) {
    if (start === null) {
      start = idx;
      prev = idx;
    } else if (prev !== null && idx === prev + 1) {
      prev = idx;
    } else {
      out.push([start, prev ?? start]);
      start = idx;
      prev = idx;
    }
  }
  if (start !== null) out.push([start, prev ?? start]);
  return out;
}

/**
 * 多人共同空闲（模块 12 #5/#6）：交集算法。
 * 以第一份课表的该天有效作息为节次基准（使用者本人作息优先），
 * 返回每一段共同空闲及被谁占用（用于展示“这段时间 A 有课”）。
 */
export function commonFreeRanges(
  base: TimetableInput,
  others: TimetableInput[],
  date: string,
): Array<{ from: number; to: number; busyFor: string[] }> {
  const occ = occurrencesForDate(base, date).filter(
    (i) => i.variant !== "cancelled" && i.variant !== "moved-away",
  );
  const dow =
    occ[0]?.dayOfWeek ??
    (new Date(`${date}T00:00:00`).getDay() === 0 ? 7 : new Date(`${date}T00:00:00`).getDay());
  const effective = slotsForDay(base.slots, dow);
  const othersOcc = others.map((o) => occurrencesForDate(o, date));

  const out: Array<{ from: number; to: number; busyFor: string[] }> = [];
  for (const [from, to] of toRanges(freeSlotIndexes(occ, effective))) {
    const busyFor: string[] = [];
    const courseNameOf = (list: CourseInstance[], slot: number): string | null => {
      const hit = list.find(
        (i) =>
          i.variant !== "cancelled" &&
          i.variant !== "moved-away" &&
          slot >= i.startSlot &&
          slot <= i.endSlot,
      );
      return hit?.courseName ?? null;
    };
    for (let slot = from; slot <= to; slot++) {
      for (const list of othersOcc) {
        const name = courseNameOf(list, slot);
        if (name && !busyFor.includes(name)) busyFor.push(name);
      }
    }
    out.push({ from, to, busyFor });
  }
  return out;
}

/** 推荐聚会时间（模块 12 #7/#8 的本地部分）：双方在节级都空闲的最长连续段。 */
export function recommendMeetingSlot(
  base: TimetableInput,
  others: TimetableInput[],
  date: string,
): { from: number; to: number } | null {
  const occ = occurrencesForDate(base, date).filter(
    (i) => i.variant !== "cancelled" && i.variant !== "moved-away",
  );
  const dow =
    occ[0]?.dayOfWeek ??
    (new Date(`${date}T00:00:00`).getDay() === 0 ? 7 : new Date(`${date}T00:00:00`).getDay());
  const effective = slotsForDay(base.slots, dow);
  const othersOcc = others.map((o) => occurrencesForDate(o, date));
  const busyFor = (list: CourseInstance[], slot: number): boolean =>
    list.some(
      (i) =>
        i.variant !== "cancelled" &&
        i.variant !== "moved-away" &&
        slot >= i.startSlot &&
        slot <= i.endSlot,
    );

  let best: { from: number; to: number } | null = null;
  let runStart: number | null = null;
  for (const slot of effective.map((s) => s.index)) {
    const baseFree = !busyFor(occ, slot);
    const allFree = baseFree && othersOcc.every((list) => !busyFor(list, slot));
    if (allFree) {
      if (runStart === null) runStart = slot;
      if (!best || slot - runStart > best.to - best.from) {
        best = { from: runStart, to: slot };
      }
    } else {
      runStart = null;
    }
  }
  return best;
}
