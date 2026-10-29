import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import {
  applyExceptions,
  buildInstancesForWeek,
} from "./schedule";

const semester: Semester = {
  id: "s1",
  name: "测试学期",
  startDate: "2026-08-31",
  weekOneAnchor: "2026-08-31",
  totalWeeks: 20,
  weekStartsOn: 1,
  status: "current",
  createdAt: 0,
  updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
  { id: "t3", semesterId: "s1", index: 3, startTime: "10:00", endTime: "10:45", createdAt: 0, updatedAt: 0 },
  { id: "t4", semesterId: "s1", index: 4, startTime: "10:55", endTime: "11:40", createdAt: 0, updatedAt: 0 },
];

const course: Course = {
  id: "c1",
  semesterId: "s1",
  name: "高等数学",
  type: "lecture",
  color: "sky",
  room: "教一-101",
  order: 0,
  createdAt: 0,
  updatedAt: 0,
};

const session: CourseSession = {
  id: "cs1",
  courseId: "c1",
  semesterId: "s1",
  dayOfWeek: 1,
  startSlot: 1,
  endSlot: 2,
  weekRule: { type: "all" },
  createdAt: 0,
  updatedAt: 0,
};

// 第 5 周：2026-09-28（周一）～ 2026-10-04（周日）
const week5Dates = [
  "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
  "2026-10-02", "2026-10-03", "2026-10-04",
];

function base() {
  return buildInstancesForWeek(semester, 5, {
    courses: [course],
    sessions: [session],
    slots,
  });
}

function courseMap() {
  return new Map([[course.id, course]]);
}

describe("applyExceptions", () => {
  it("停课：实例标记 cancelled，信息保留", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "cancel",
      semesterId: "s1",
      courseId: "c1",
      sessionId: "cs1",
      originalDate: "2026-09-28",
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    expect(list).toHaveLength(1);
    expect(list[0]?.variant).toBe("cancelled");
  });

  it("调课（原地改教室）：adjusted 且字段更新", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "adjust",
      semesterId: "s1",
      courseId: "c1",
      sessionId: "cs1",
      originalDate: "2026-09-28",
      newRoom: "教三-401",
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    expect(list[0]?.variant).toBe("adjusted");
    expect(list[0]?.room).toBe("教三-401");
    expect(list[0]?.date).toBe("2026-09-28");
  });

  it("调课（换到同周另一天）：原位置 moved-away，新位置 adjusted", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "adjust",
      semesterId: "s1",
      courseId: "c1",
      sessionId: "cs1",
      originalDate: "2026-09-28",
      newDate: "2026-09-30",
      newStartSlot: 3,
      newEndSlot: 4,
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    const movedAway = list.find((i) => i.date === "2026-09-28");
    const movedIn = list.find((i) => i.date === "2026-09-30");
    expect(movedAway?.variant).toBe("moved-away");
    expect(movedIn?.variant).toBe("adjusted");
    expect(movedIn?.startSlot).toBe(3);
    expect(movedIn?.endTime).toBe("11:40");
  });

  it("调课：新日期在另一周时，本周只留下 moved-away 占位", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "adjust",
      semesterId: "s1",
      courseId: "c1",
      sessionId: "cs1",
      originalDate: "2026-09-28",
      newDate: "2026-10-06", // 第 6 周
      newStartSlot: 3,
      newEndSlot: 4,
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    expect(list).toHaveLength(1);
    expect(list[0]?.variant).toBe("moved-away");
  });

  it("补课：在指定日期新增 extra 实例", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "extra",
      semesterId: "s1",
      courseId: "c1",
      date: "2026-10-03", // 周六
      startSlot: 3,
      endSlot: 4,
      room: "教二-202",
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    const extra = list.find((i) => i.variant === "extra");
    expect(extra?.date).toBe("2026-10-03");
    expect(extra?.room).toBe("教二-202");
    expect(extra?.teacher).toBeUndefined();
    expect(extra?.startTime).toBe("10:00");
  });

  it("补课日期在假期（超出教学周）时不会出现在教学周实例里", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "extra",
      semesterId: "s1",
      courseId: "c1",
      date: "2026-01-20", // 寒假
      startSlot: 1,
      endSlot: 2,
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    expect(list.filter((i) => i.variant === "extra")).toHaveLength(0);
  });

  it("无关例外的课程不影响当前课表", () => {
    const ex: CourseException = {
      id: "e1",
      kind: "cancel",
      semesterId: "s1",
      courseId: "ghost",
      sessionId: "ghost-session",
      originalDate: "2026-09-28",
      createdAt: 0,
      updatedAt: 0,
    };
    const list = applyExceptions(week5Dates, base(), [ex], courseMap(), slots);
    expect(list[0]?.variant).toBe("normal");
  });
});
