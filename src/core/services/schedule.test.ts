import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseSession, Semester } from "@/core/models";
import {
  assignLanes,
  buildInstancesForWeek,
  getInstanceStatus,
  instancesForDate,
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

const slots: ClassTimeSlot[] = Array.from({ length: 12 }, (_, i) => ({
  id: `slot-${i + 1}`,
  semesterId: "s1",
  index: i + 1,
  startTime: `${String(8 + i).padStart(2, "0")}:00`,
  endTime: `${String(8 + i).padStart(2, "0")}:45`,
  createdAt: 0,
  updatedAt: 0,
}));

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "c1",
    semesterId: "s1",
    name: "高等数学",
    type: "lecture",
    color: "sky",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function session(overrides: Partial<CourseSession> = {}): CourseSession {
  return {
    id: "cs1",
    courseId: "c1",
    semesterId: "s1",
    dayOfWeek: 1,
    startSlot: 1,
    endSlot: 2,
    weekRule: { type: "all" },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildInstancesForWeek", () => {
  const data = (cs: CourseSession[], cs2?: Course[]) => ({
    courses: cs2 ?? [course()],
    sessions: cs,
    slots,
  });

  it("每周课程在每周都出现，日期与星期对应", () => {
    const list = buildInstancesForWeek(semester, 1, data([session()]));
    expect(list).toHaveLength(1);
    expect(list[0]?.date).toBe("2026-08-31"); // 第 1 周周一
    expect(list[0]?.startTime).toBe("08:00"); // 第 1 节开始
    expect(list[0]?.endTime).toBe("09:45"); // 第 2 节（09:00-09:45）结束
  });

  it("单双周课程只出现在对应周", () => {
    const odd = session({ id: "odd", weekRule: { type: "odd" } });
    expect(buildInstancesForWeek(semester, 3, data([odd]))).toHaveLength(1);
    expect(buildInstancesForWeek(semester, 4, data([odd]))).toHaveLength(0);
  });

  it("多门课程、多安排混合", () => {
    const english = course({ id: "c2", name: "英语" });
    const list = buildInstancesForWeek(
      semester,
      2,
      data(
        [
          session({ courseId: "c1", dayOfWeek: 1, weekRule: { type: "range", from: 1, to: 8 } }),
          session({ id: "cs2", courseId: "c2", dayOfWeek: 1, startSlot: 3, endSlot: 4 }),
          session({ id: "cs3", courseId: "c2", dayOfWeek: 3, weekRule: { type: "custom", weeks: [2, 4] } }),
        ],
        [course(), english],
      ),
    );
    expect(list).toHaveLength(3);
    const dates = new Set(list.map((i) => i.date));
    expect(dates.has("2026-09-07")).toBe(true);
    expect(dates.has("2026-09-09")).toBe(true);
  });

  it("越界周次返回空（假期）", () => {
    expect(buildInstancesForWeek(semester, 0, data([session()]))).toHaveLength(0);
    expect(buildInstancesForWeek(semester, 21, data([session()]))).toHaveLength(0);
  });

  it("安排引用不存在的课程时被忽略", () => {
    expect(
      buildInstancesForWeek(semester, 1, data([session({ courseId: "ghost" })])),
    ).toHaveLength(0);
  });
});

describe("instancesForDate", () => {
  it("按日期过滤并按起始节次排序", () => {
    const list = [
      { key: "a", date: "2026-08-31", startSlot: 5 },
      { key: "b", date: "2026-08-31", startSlot: 1 },
      { key: "c", date: "2026-09-01", startSlot: 1 },
    ];
    const filtered = instancesForDate(list as never, "2026-08-31");
    expect(filtered.map((i) => i.key)).toEqual(["b", "a"]);
  });
});

describe("assignLanes", () => {
  it("时间衔接的课共用一列", () => {
    const r = assignLanes([
      { startSlot: 1, endSlot: 2 },
      { startSlot: 3, endSlot: 4 },
    ]);
    expect(r.laneCount).toBe(1);
    expect(r.lanes).toEqual([0, 0]);
  });

  it("完全重叠的课分两道", () => {
    const r = assignLanes([
      { startSlot: 1, endSlot: 4 },
      { startSlot: 2, endSlot: 3 },
    ]);
    expect(r.laneCount).toBe(2);
  });

  it("相邻节次（前一节结束=后一节开始）不共用一列", () => {
    const r = assignLanes([
      { startSlot: 1, endSlot: 2 },
      { startSlot: 2, endSlot: 3 },
    ]);
    expect(r.laneCount).toBe(2);
  });

  it("空列表返回一列", () => {
    expect(assignLanes([])).toEqual({ lanes: [], laneCount: 1 });
  });
});

describe("getInstanceStatus", () => {
  const now = new Date("2026-09-02T10:20:00"); // 周三 10:20

  it("进行中", () => {
    expect(
      getInstanceStatus(
        { date: "2026-09-02", startTime: "10:00", endTime: "10:45" },
        now,
      ),
    ).toBe("ongoing");
  });

  it("未开始 / 已结束", () => {
    expect(
      getInstanceStatus(
        { date: "2026-09-02", startTime: "14:00", endTime: "14:45" },
        now,
      ),
    ).toBe("upcoming");
    expect(
      getInstanceStatus(
        { date: "2026-09-02", startTime: "08:00", endTime: "08:45" },
        now,
      ),
    ).toBe("past");
  });

  it("非今天的课按日期判断", () => {
    expect(
      getInstanceStatus(
        { date: "2026-09-03", startTime: "08:00", endTime: "08:45" },
        now,
      ),
    ).toBe("upcoming");
    expect(
      getInstanceStatus(
        { date: "2026-09-01", startTime: "23:00", endTime: "23:59" },
        now,
      ),
    ).toBe("past");
  });

  it("缺时间信息返回 null", () => {
    expect(getInstanceStatus({ date: "2026-09-02" }, now)).toBeNull();
  });
});
