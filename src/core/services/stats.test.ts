import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { computeSemesterStats, expandSemesterOccurrences } from "./stats";

const semester: Semester = {
  id: "s1", name: "统计测试", startDate: "2026-08-31", weekOneAnchor: "2026-08-31",
  totalWeeks: 4, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
  { id: "t3", semesterId: "s1", index: 3, startTime: "10:00", endTime: "10:45", createdAt: 0, updatedAt: 0 },
  { id: "t11", semesterId: "s1", index: 11, startTime: "19:00", endTime: "19:45", createdAt: 0, updatedAt: 0 },
];

const courses: Course[] = [
  { id: "c1", semesterId: "s1", name: "高数", type: "lecture", color: "sky", order: 0, createdAt: 0, updatedAt: 0 },
  { id: "c2", semesterId: "s1", name: "晚课", type: "elective", color: "rose", order: 1, createdAt: 0, updatedAt: 0 },
];

const sessions: CourseSession[] = [
  { id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1, startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 },
  { id: "cs2", courseId: "c2", semesterId: "s1", dayOfWeek: 3, startSlot: 11, endSlot: 11, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 },
];

describe("expandSemesterOccurrences / computeSemesterStats", () => {
  it("展开数量与周次正确（4 周 × 各 1 课 = 4+4）", () => {
    const all = expandSemesterOccurrences(semester, slots, courses, sessions, []);
    expect(all).toHaveLength(8);
  });

  it("基础指标：总节数、时段拆分、早八", () => {
    const s = computeSemesterStats({
      semester, slots, courses, sessions, exceptions: [], nowDate: "2026-09-07",
    });
    // 每周：高数 2 节 + 晚课 1 节 = 3 节 × 4 周 = 12 节
    expect(s.totalSlots).toBe(12);
    expect(s.timeSplit.morning).toBe(4);
    expect(s.timeSplit.evening).toBe(4);
    expect(s.timeSplit.earlyFirst).toBe(4);
    expect(s.totalCourses).toBe(2);
  });

  it("星期分布与最忙/最闲", () => {
    const s = computeSemesterStats({
      semester, slots, courses, sessions, exceptions: [], nowDate: "2026-09-07",
    });
    expect(s.histograms.byDay[1]).toBe(4);
    expect(s.histograms.byDay[3]).toBe(4);
    expect(s.busiestDay === 1 || s.busiestDay === 3).toBe(true);
    expect(s.freestDay).not.toBeNull();
  });

  it("停课扣减、补课计入、例外计数", () => {
    const exceptions: CourseException[] = [
      { id: "e1", kind: "cancel", semesterId: "s1", courseId: "c1", sessionId: "cs1", originalDate: "2026-08-31", createdAt: 0, updatedAt: 0 },
      { id: "e2", kind: "extra", semesterId: "s1", courseId: "c1", date: "2026-09-05", startSlot: 3, endSlot: 3, createdAt: 0, updatedAt: 0 },
    ];
    const s = computeSemesterStats({
      semester, slots, courses, sessions, exceptions, nowDate: "2026-09-07",
    });
    expect(s.cancelCount).toBe(1);
    expect(s.extraCount).toBe(1);
    // 12 - 2(停) + 1(补) = 11
    expect(s.totalSlots).toBe(11);
  });

  it("教学进度与剩余课次", () => {
    const s = computeSemesterStats({
      semester, slots, courses, sessions, exceptions: [], nowDate: "2026-09-14",
    });
    // 第 3 周 → 已完成 2/4
    expect(s.currentWeek).toBe(3);
    expect(s.completedWeekRatio).toBeCloseTo(0.5);
    // date >= 09-14 的课次：第 3 周周一 09-14、周三 09-16 + 第 4 周两门 = 4
    expect(s.remainingOccurrences).toBe(4);
  });

  it("每门课节数排序", () => {
    const s = computeSemesterStats({
      semester, slots, courses, sessions, exceptions: [], nowDate: "2026-09-07",
    });
    expect(s.perCourse[0]?.name).toBe("高数");
    expect(s.perCourse[0]?.slotsTotal).toBe(8);
    expect(s.perCourse[1]?.slotsTotal).toBe(4);
  });
});
