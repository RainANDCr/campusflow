import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { shiftOutOfQuietHours } from "./notifications";
import {
  buildClassNotifications,
  buildExamNotifications,
  buildTodoNotifications,
  makeMinutesResolver,
} from "./notifications";
import { applyExceptions, buildInstancesForWeek } from "./schedule";

// 以 2026-09-28（第 5 周周一）10:20 为“现在”
const NOW = new Date("2026-09-28T10:20:00");

const semester: Semester = {
  id: "s1", name: "测试学期", startDate: "2026-08-31", weekOneAnchor: "2026-08-31",
  totalWeeks: 20, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t3", semesterId: "s1", index: 3, startTime: "10:00", endTime: "10:45", createdAt: 0, updatedAt: 0 },
  { id: "t5", semesterId: "s1", index: 5, startTime: "12:00", endTime: "12:45", createdAt: 0, updatedAt: 0 },
];

const course: Course = {
  id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky",
  room: "教一-101", teacher: "张教授", order: 0, createdAt: 0, updatedAt: 0,
};

const session: CourseSession = {
  id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1,
  startSlot: 5, endSlot: 5, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0,
};

const week5Dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

function todayInstances(extraExceptions: CourseException[] = []) {
  const base = buildInstancesForWeek(semester, 5, { courses: [course], sessions: [session], slots });
  return applyExceptions(week5Dates, base, extraExceptions, new Map([[course.id, course]]), slots)
    .filter((i) => i.date === "2026-09-28");
}

describe("shiftOutOfQuietHours（静音时段，模块 05 #16）", () => {
  it("未启用时原样返回", () => {
    const t = new Date("2026-09-28T23:30:00").getTime();
    expect(shiftOutOfQuietHours(t, { enabled: false, start: "23:00", end: "07:00" })).toBe(t);
  });

  it("窗口内的提醒顺延到结束时刻", () => {
    const t = new Date("2026-09-28T23:30:00").getTime();
    const shifted = shiftOutOfQuietHours(t, { enabled: true, start: "23:00", end: "07:00" });
    expect(new Date(shifted).getHours()).toBe(7);
    expect(new Date(shifted).getDate()).toBe(29); // 跨午夜 → 次日 07:00
  });

  it("窗口外（含边界结束点）不调整", () => {
    const t = new Date("2026-09-28T12:00:00").getTime();
    expect(shiftOutOfQuietHours(t, { enabled: true, start: "23:00", end: "07:00" })).toBe(t);
    const end = new Date("2026-09-28T07:00:00").getTime();
    expect(shiftOutOfQuietHours(end, { enabled: true, start: "23:00", end: "07:00" })).toBe(end);
  });
});

describe("buildClassNotifications 增强行为", () => {
  it("默认行为与旧版一致（无下课/无摘要/周末提醒开）", () => {
    const list = buildClassNotifications(NOW, todayInstances(), () => 10);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("class-cs1@2026-09-28-10");
  });

  it("下课提醒（模块 05 #3）：结束时刻触发", () => {
    const list = buildClassNotifications(NOW, todayInstances(), () => null, {
      includeEndOfClass: true,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("eoc-cs1@2026-09-28");
    expect(new Date(list[0]?.fireAt ?? 0).getHours()).toBe(12);
    expect(list[0]?.title).toContain("下课：高等数学");
  });

  it("首课摘要（模块 05 #5）：提前 60 分钟汇总", () => {
    const list = buildClassNotifications(NOW, todayInstances(), () => null, {
      includeSummary: true,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("summary-2026-09-28");
    expect(list[0]?.title).toBe("今日有 1 门课");
    expect(new Date(list[0]?.fireAt ?? 0).getHours()).toBe(11);
  });

  it("周末开关（模块 05 #17）：关闭时周六日的课不提醒", () => {
    // 构造周六 10-03 的补课实例
    const extra: CourseException = {
      id: "e1", kind: "extra", semesterId: "s1", courseId: "c1",
      date: "2026-10-03", startSlot: 5, endSlot: 5, createdAt: 0, updatedAt: 0,
    };
    const saturday = new Date("2026-10-03T10:20:00");
    const base = buildInstancesForWeek(semester, 5, { courses: [course], sessions: [session], slots });
    const all = applyExceptions(week5Dates, base, [extra], new Map([[course.id, course]]), slots)
      .filter((i) => i.date === "2026-10-03");
    expect(buildClassNotifications(saturday, all, () => 10, { weekendReminder: true })).toHaveLength(1);
    expect(buildClassNotifications(saturday, all, () => 10, { weekendReminder: false })).toHaveLength(0);
  });

  it("调课/补课的提醒带变更前缀（模块 05 #8/9/11）", () => {
    const adjust: CourseException = {
      id: "e2", kind: "adjust", semesterId: "s1", courseId: "c1", sessionId: "cs1",
      originalDate: "2026-09-28", newRoom: "教五-305", note: "教室临时调整", createdAt: 0, updatedAt: 0,
    };
    const instances = todayInstances([adjust]);
    const list = buildClassNotifications(NOW, instances, () => 10);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toContain("【已调整】");
    expect(list[0]?.body).toContain("教五-305");
    expect(list[0]?.body).toContain("教室临时调整");
  });

  it("静音时段内落点的提醒被顺延", () => {
    // 现在是 10:20，提前 10 分钟 → 11:50 不在静音内；构造静音 11:00-13:00 → 顺延到 13:00
    const list = buildClassNotifications(NOW, todayInstances(), () => 10, {
      quietHours: { enabled: true, start: "11:00", end: "13:00" },
    });
    expect(list).toHaveLength(1);
    expect(new Date(list[0]?.fireAt ?? 0).getHours()).toBe(13);
  });
});

describe("makeMinutesResolver", () => {
  const globalRule = {
    id: "g1", scope: "global", kind: "class", minutesBefore: 15, enabled: true, createdAt: 0, updatedAt: 0,
  } as const;

  it("无覆盖时使用全局规则", () => {
    expect(makeMinutesResolver(globalRule, new Map())("c1")).toBe(15);
  });

  it("课程覆盖优先；课程级关闭覆盖全局开启", () => {
    const courseRule = {
      id: "r1", scope: "course", kind: "class", courseId: "c1", minutesBefore: 30, enabled: true, createdAt: 0, updatedAt: 0,
    } as const;
    expect(makeMinutesResolver(globalRule, new Map([["c1", courseRule]]))("c1")).toBe(30);
    const off = { ...courseRule, enabled: false };
    expect(makeMinutesResolver(globalRule, new Map([["c1", off]]))("c1")).toBeNull();
  });
});

describe("buildExamNotifications（含静音）", () => {
  it("考试前 30 分钟提醒，静音内顺延", () => {
    const exam = {
      id: "ex1", semesterId: "s1", name: "高数期末", date: "2026-09-28",
      startTime: "13:00", endTime: "15:00", createdAt: 0, updatedAt: 0,
    };
    const list = buildExamNotifications(NOW, [exam]);
    expect(list).toHaveLength(1);
    expect(new Date(list[0]?.fireAt ?? 0).getHours()).toBe(12);
    const quiet = buildExamNotifications(NOW, [exam], { enabled: true, start: "12:00", end: "14:00" });
    expect(new Date(quiet[0]?.fireAt ?? 0).getHours()).toBe(14);
  });

  it("过期的考试不提醒", () => {
    const past = {
      id: "ex2", semesterId: "s1", name: "已结束", date: "2026-09-27",
      startTime: "14:00", endTime: "16:00", createdAt: 0, updatedAt: 0,
    };
    expect(buildExamNotifications(NOW, [past])).toHaveLength(0);
  });
});

describe("buildTodoNotifications（模块 08 #3）", () => {
  const todo = (overrides: Partial<import("@/core/models").ScheduleEvent>) => ({
    id: "t1", title: "交作业", date: "2026-09-28", allDay: true,
    category: "todo" as const, done: false, createdAt: 0, updatedAt: 0,
    ...overrides,
  });

  it("截止日当天 08:00 提醒（NOW 已过 8 点 → 5 分钟后）", () => {
    const list = buildTodoNotifications(NOW, [todo({})]);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("今日截止：交作业");
    // NOW=10:20，08:00 已过 → 顺延为 now+5min
    const fire = list[0]?.fireAt ?? 0;
    expect(fire - NOW.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1000);
  });

  it("已过 8 点则 5 分钟后提醒（逾期未完成每日轻提醒）", () => {
    const list = buildTodoNotifications(
      NOW,
      [todo({ date: "2026-09-25" })], // 3 天前截止
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toContain("逾期提醒");
    const fire = list[0]?.fireAt ?? 0;
    expect(fire).toBeGreaterThan(NOW.getTime());
    expect(fire - NOW.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1000);
  });

  it("已完成/未来截止/非待办不提醒", () => {
    expect(buildTodoNotifications(NOW, [todo({ done: true })])).toHaveLength(0);
    expect(buildTodoNotifications(NOW, [todo({ date: "2026-10-15" })])).toHaveLength(0);
    expect(
      buildTodoNotifications(NOW, [todo({ category: "personal" })]),
    ).toHaveLength(0);
  });
});
