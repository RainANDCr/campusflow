import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseSession, Semester } from "@/core/models";
import { expandSessionToTimes, findTimeConflicts, timeIntervalsOverlap } from "./conflictTime";

const semester: Semester = {
  id: "s1", name: "测试学期", startDate: "2026-08-31", weekOneAnchor: "2026-08-31",
  totalWeeks: 20, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
  { id: "t3", semesterId: "s1", index: 3, startTime: "10:00", endTime: "10:45", createdAt: 0, updatedAt: 0 },
];

const course: Course = {
  id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky",
  order: 0, createdAt: 0, updatedAt: 0,
};

function session(overrides: Partial<CourseSession> = {}): CourseSession {
  return {
    id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1,
    startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("timeIntervalsOverlap（半开区间）", () => {
  it("相邻不算冲突：08:45 结束与 08:45 开始", () => {
    expect(timeIntervalsOverlap("08:00", "08:45", "08:45", "09:30")).toBe(false);
    expect(timeIntervalsOverlap("08:45", "09:30", "08:00", "08:45")).toBe(false);
  });

  it("相交算冲突", () => {
    expect(timeIntervalsOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
    expect(timeIntervalsOverlap("08:30", "09:30", "08:00", "09:00")).toBe(true);
    expect(timeIntervalsOverlap("08:00", "09:00", "08:00", "09:00")).toBe(true);
  });

  it("包含关系算冲突", () => {
    expect(timeIntervalsOverlap("08:00", "10:00", "08:30", "09:00")).toBe(true);
  });
});

describe("expandSessionToTimes", () => {
  it("按周次规则与节次展开为具体日期时刻", () => {
    const list = expandSessionToTimes({
      session: session({ weekRule: { type: "odd" } }),
      course,
      semester,
      slots,
      rangeStart: "2026-08-31", // 第 1 周周一
      rangeEnd: "2026-09-20",   // 第 3 周周日
    });
    // 第 1、3 周周一（奇数周）：08-31 与 09-14
    expect(list.map((o) => o.date)).toEqual(["2026-08-31", "2026-09-14"]);
    expect(list[0]).toMatchObject({ startTime: "08:00", endTime: "09:40", startSlot: 1, endSlot: 2 });
  });

  it("范围外的日期被裁剪", () => {
    const list = expandSessionToTimes({
      session: session(),
      course,
      semester,
      slots,
      rangeStart: "2026-09-02", // 周三：第 1 周的周一已被裁掉
      rangeEnd: "2026-09-14",
    });
    expect(list.map((o) => o.date)).toEqual(["2026-09-07", "2026-09-14"]);
  });

  it("节次缺失的安排不展开", () => {
    const list = expandSessionToTimes({
      session: session({ startSlot: 99, endSlot: 100 }),
      course,
      semester,
      slots,
      rangeStart: "2026-08-31",
      rangeEnd: "2026-09-06",
    });
    expect(list).toHaveLength(0);
  });
});

describe("findTimeConflicts", () => {
  const occ = (key: string, date: string, startTime: string, endTime: string) => ({
    key, date, startTime, endTime,
  });

  it("同一天时刻相交 → 冲突；相邻 → 无冲突", () => {
    const conflicts = findTimeConflicts([
      occ("a", "2026-09-07", "08:00", "08:45"),
      occ("b", "2026-09-07", "08:30", "09:30"),
      occ("c", "2026-09-07", "09:30", "10:00"), // 与 b 相邻，不冲突
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ aKey: "a", bKey: "b", date: "2026-09-07", startTime: "08:30", endTime: "08:45" });
  });

  it("不同日期不冲突", () => {
    const conflicts = findTimeConflicts([
      occ("a", "2026-09-07", "08:00", "09:00"),
      occ("b", "2026-09-08", "08:00", "09:00"),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("三节课两两重叠输出三组", () => {
    const conflicts = findTimeConflicts([
      occ("a", "d1", "08:00", "10:00"),
      occ("b", "d1", "08:30", "09:00"),
      occ("c", "d1", "09:00", "09:30"),
    ]);
    expect(conflicts).toHaveLength(2); // a-b, a-c；b 与 c 相邻不冲突
  });
});
