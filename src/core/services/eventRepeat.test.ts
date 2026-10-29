import { describe, expect, it } from "vitest";
import { eventConflictsWithClasses, eventOccursOn, nextOccurrence } from "./eventRepeat";

describe("eventOccursOn", () => {
  const weekly = { date: "2026-09-07", repeat: "weekly" as const }; // 周一
  const yearly = { date: "2000-02-29", repeat: "yearly" as const }; // 生日
  const once = { date: "2026-10-01", repeat: "none" as const };

  it("每周：同星期命中，锚定日前不命中", () => {
    expect(eventOccursOn(weekly, "2026-09-14")).toBe(true); // 下一个周一
    expect(eventOccursOn(weekly, "2026-09-15")).toBe(false);
    expect(eventOccursOn(weekly, "2026-09-06")).toBe(false); // 锚定前
  });

  it("每年：月日相同命中（2/29 在非闰年落到 2/28 不消失）", () => {
    expect(eventOccursOn(yearly, "2027-02-28")).toBe(false); // 2027 非闰年
    expect(eventOccursOn({ date: "2000-02-28", repeat: "yearly" }, "2027-02-28")).toBe(true);
    expect(eventOccursOn(yearly, "2028-02-29")).toBe(true); // 2028 闰年
    expect(eventOccursOn(yearly, "2027-03-01")).toBe(false);
  });

  it("不重复：仅锚定日", () => {
    expect(eventOccursOn(once, "2026-10-01")).toBe(true);
    expect(eventOccursOn(once, "2027-10-01")).toBe(false);
    expect(eventOccursOn({ date: "2026-10-01" }, "2027-10-01")).toBe(false); // 缺省按不重复
  });
});

describe("nextOccurrence", () => {
  it("每周日程返回下一次发生", () => {
    expect(nextOccurrence({ date: "2026-09-07", repeat: "weekly" }, "2026-09-29")).toBe("2026-10-05");
    expect(nextOccurrence({ date: "2026-09-07", repeat: "weekly" }, "2026-10-05")).toBe("2026-10-05");
  });

  it("每年生日返回今年或明年", () => {
    expect(nextOccurrence({ date: "2000-06-15", repeat: "yearly" }, "2026-09-29")).toBe("2027-06-15");
    expect(nextOccurrence({ date: "2000-06-15", repeat: "yearly" }, "2026-06-01")).toBe("2026-06-15");
  });

  it("不重复且已过期返回 null", () => {
    expect(nextOccurrence({ date: "2026-01-01" }, "2026-09-29")).toBeNull();
  });
});

describe("eventConflictsWithClasses（模块 11 #18）", () => {
  const classes = [
    { date: "2026-09-28", startTime: "08:00", endTime: "08:45" },
    { date: "2026-09-28", startTime: "10:00", endTime: "10:45" },
  ];

  it("时段相交冲突", () => {
    expect(
      eventConflictsWithClasses(
        { date: "2026-09-28", allDay: false, startTime: "08:30", endTime: "09:30" },
        classes,
      ),
    ).toBe(true);
  });

  it("相邻不冲突", () => {
    expect(
      eventConflictsWithClasses(
        { date: "2026-09-28", allDay: false, startTime: "08:45", endTime: "09:30" },
        classes,
      ),
    ).toBe(false);
  });

  it("全天日程与任意当天课程冲突", () => {
    expect(
      eventConflictsWithClasses({ date: "2026-09-28", allDay: true }, classes),
    ).toBe(true);
    expect(
      eventConflictsWithClasses({ date: "2026-09-29", allDay: true }, classes),
    ).toBe(false);
  });
});
