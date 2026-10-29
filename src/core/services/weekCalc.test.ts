import { describe, expect, it } from "vitest";
import type { WeekStartsOn } from "@/core/models";
import {
  computeWeekOneAnchor,
  getDateForDay,
  getWeekDates,
  getWeekInfo,
  orderedDaysOfWeek,
} from "./weekCalc";

// 2026-2027 学年第一学期：2026-09-01（周二）开学，共 20 个教学周
const SEMESTER = {
  weekOneAnchor: "2026-08-31", // 自动推算出的周一
  totalWeeks: 20,
  weekStartsOn: 1 as WeekStartsOn,
};

describe("computeWeekOneAnchor", () => {
  it("周二开学 → 本周周一", () => {
    expect(computeWeekOneAnchor("2026-09-01", 1)).toBe("2026-08-31");
  });

  it("周一开学 → 自身", () => {
    expect(computeWeekOneAnchor("2026-09-07", 1)).toBe("2026-09-07");
  });

  it("周日开学（weekStartsOn=1）→ 次日周一", () => {
    expect(computeWeekOneAnchor("2026-09-06", 1)).toBe("2026-08-31");
  });

  it("周日开学（weekStartsOn=0）→ 自身", () => {
    expect(computeWeekOneAnchor("2026-09-06", 0)).toBe("2026-09-06");
  });
});

describe("getWeekInfo", () => {
  it("第一周：周一与周日", () => {
    expect(getWeekInfo(SEMESTER, "2026-08-31")).toEqual({
      phase: "teaching",
      week: 1,
    });
    expect(getWeekInfo(SEMESTER, "2026-09-06")).toEqual({
      phase: "teaching",
      week: 1,
    });
  });

  it("第二周从下一个周一开始", () => {
    expect(getWeekInfo(SEMESTER, "2026-09-07")).toEqual({
      phase: "teaching",
      week: 2,
    });
  });

  it("开学之前 → before（假期）", () => {
    expect(getWeekInfo(SEMESTER, "2026-08-30")).toEqual({ phase: "before" });
  });

  it("最后一个教学周（跨年到 2027-01-17）", () => {
    expect(getWeekInfo(SEMESTER, "2027-01-11")).toEqual({
      phase: "teaching",
      week: 20,
    });
    expect(getWeekInfo(SEMESTER, "2027-01-17")).toEqual({
      phase: "teaching",
      week: 20,
    });
  });

  it("教学周结束后 → after（假期）", () => {
    expect(getWeekInfo(SEMESTER, "2027-01-18")).toEqual({ phase: "after" });
  });

  it("weekStartsOn=0：周日制", () => {
    const s = { weekOneAnchor: "2026-08-30", totalWeeks: 20, weekStartsOn: 0 as WeekStartsOn };
    expect(getWeekInfo(s, "2026-09-05")).toEqual({ phase: "teaching", week: 1 });
    expect(getWeekInfo(s, "2026-09-06")).toEqual({ phase: "teaching", week: 2 });
  });
});

describe("getWeekDates", () => {
  it("第 1 周为 2026-08-31 至 2026-09-06（周一优先）", () => {
    const dates = getWeekDates(SEMESTER, 1);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-08-31");
    expect(dates[6]).toBe("2026-09-06");
  });

  it("第 20 周正确跨年（2027-01-11 至 2027-01-17）", () => {
    const dates = getWeekDates(SEMESTER, 20);
    expect(dates[0]).toBe("2027-01-11");
    expect(dates[6]).toBe("2027-01-17");
  });

  it("weekStartsOn=0 时第 1 周从周日 2026-08-30 开始", () => {
    const s = { weekOneAnchor: "2026-08-30", totalWeeks: 20, weekStartsOn: 0 as WeekStartsOn };
    const dates = getWeekDates(s, 1);
    expect(dates[0]).toBe("2026-08-30");
    expect(dates[6]).toBe("2026-09-05");
  });
});

describe("getDateForDay", () => {
  it("第 1 周周三 = 2026-09-02", () => {
    expect(getDateForDay(SEMESTER, 1, 3)).toBe("2026-09-02");
  });

  it("第 2 周周一 = 2026-09-07", () => {
    expect(getDateForDay(SEMESTER, 2, 1)).toBe("2026-09-07");
  });

  it("weekStartsOn=0 时仍以 ISO 星期换算", () => {
    const s = { weekOneAnchor: "2026-08-30", totalWeeks: 20, weekStartsOn: 0 as WeekStartsOn };
    expect(getDateForDay(s, 1, 1)).toBe("2026-08-31"); // 周一
    expect(getDateForDay(s, 1, 6)).toBe("2026-09-05"); // 周六
    expect(getDateForDay(s, 1, 7)).toBe("2026-09-06"); // 周日
  });
});

describe("orderedDaysOfWeek", () => {
  it("周一优先", () => {
    expect(orderedDaysOfWeek(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("周日优先", () => {
    expect(orderedDaysOfWeek(0)).toEqual([7, 1, 2, 3, 4, 5, 6]);
  });
});
