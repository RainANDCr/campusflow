import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { planHolidayCancels } from "./holiday";

const semester: Semester = {
  id: "s1", name: "测试学期", startDate: "2026-08-31", weekOneAnchor: "2026-08-31",
  totalWeeks: 20, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
];

const courses: Course[] = [
  { id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky", order: 0, createdAt: 0, updatedAt: 0 },
  { id: "c2", semesterId: "s1", name: "大学英语", type: "elective", color: "rose", order: 1, createdAt: 0, updatedAt: 0 },
];

const sessions: CourseSession[] = [
  { id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1, startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 },
  { id: "cs2", courseId: "c2", semesterId: "s1", dayOfWeek: 3, startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 },
];

// 第 5 周：09-28（周一）～ 10-04（周日）
const RANGE = { rangeStart: "2026-09-28", rangeEnd: "2026-10-04" };

describe("planHolidayCancels", () => {
  it("范围内全部课次都被计划停课", () => {
    const plan = planHolidayCancels({ semester, slots, courses, sessions, exceptions: [], ...RANGE });
    expect(plan.map((p) => `${p.courseName}@${p.originalDate}`)).toEqual([
      "高等数学@2026-09-28",
      "大学英语@2026-09-30",
    ]);
  });

  it("已停课/已调走的课次不重复计划", () => {
    const exceptions: CourseException[] = [
      { id: "e1", kind: "cancel", semesterId: "s1", courseId: "c1", sessionId: "cs1", originalDate: "2026-09-28", createdAt: 0, updatedAt: 0 },
    ];
    const plan = planHolidayCancels({ semester, slots, courses, sessions, exceptions, ...RANGE });
    expect(plan.map((p) => p.courseName)).toEqual(["大学英语"]);
  });

  it("周次规则不命中的周不产生计划", () => {
    const oddOnly: CourseSession[] = [{ ...sessions[0]!, weekRule: { type: "odd" } }];
    const plan = planHolidayCancels({
      semester, slots, courses, sessions: oddOnly, exceptions: [], ...RANGE,
    });
    // 第 5 周是奇数周 → 仍命中
    expect(plan).toHaveLength(1);
    const evenOnly: CourseSession[] = [{ ...sessions[0]!, weekRule: { type: "even" } }];
    const plan2 = planHolidayCancels({
      semester, slots, courses, sessions: evenOnly, exceptions: [], ...RANGE,
    });
    expect(plan2).toHaveLength(0);
  });

  it("范围颠倒返回空", () => {
    const plan = planHolidayCancels({
      semester, slots, courses, sessions, exceptions: [],
      rangeStart: "2026-10-04", rangeEnd: "2026-09-28",
    });
    expect(plan).toHaveLength(0);
  });
});
