import { describe, expect, it } from "vitest";
import type { ClassTimeSlot } from "@/core/models";
import { baseSlots, breakAfter, breaksIn, dayHasSlot, slotsForDay } from "./slots";

function slot(
  index: number,
  startTime: string,
  endTime: string,
  dayOfWeek?: number,
): ClassTimeSlot {
  return {
    id: `t${dayOfWeek ?? "b"}-${index}`,
    semesterId: "s1",
    index,
    startTime,
    endTime,
    dayOfWeek,
    createdAt: 0,
    updatedAt: 0,
  };
}

// 通用作息 6 节 + 周四专属作息 4 节（含第 3 节时间不同）
const ALL: ClassTimeSlot[] = [
  slot(1, "08:00", "08:45"),
  slot(2, "08:55", "09:40"),
  slot(3, "10:00", "10:45"),
  slot(4, "10:55", "11:40"),
  slot(5, "12:00", "12:45"),
  slot(6, "12:55", "13:40"),
  slot(1, "08:30", "09:15", 4),
  slot(2, "09:25", "10:10", 4),
  slot(3, "10:30", "11:15", 4),
  slot(4, "11:25", "12:10", 4),
];

describe("slotsForDay", () => {
  it("无专属作息的星期使用通用作息", () => {
    const monday = slotsForDay(ALL, 1);
    expect(monday).toHaveLength(6);
    expect(monday[0]?.startTime).toBe("08:00");
    expect(monday.every((s) => s.dayOfWeek === undefined)).toBe(true);
  });

  it("有专属作息的星期整日使用专属作息", () => {
    const thursday = slotsForDay(ALL, 4);
    expect(thursday).toHaveLength(4);
    expect(thursday[0]?.startTime).toBe("08:30");
    expect(thursday.every((s) => s.dayOfWeek === 4)).toBe(true);
  });

  it("第 3 节在周四与周一时间不同", () => {
    expect(slotsForDay(ALL, 1).find((s) => s.index === 3)?.startTime).toBe("10:00");
    expect(slotsForDay(ALL, 4).find((s) => s.index === 3)?.startTime).toBe("10:30");
  });

  it("baseSlots 只返回通用作息", () => {
    expect(baseSlots(ALL)).toHaveLength(6);
  });
});

describe("dayHasSlot", () => {
  it("按该天有效作息判断节次是否存在", () => {
    expect(dayHasSlot(ALL, 1, 5)).toBe(true);
    expect(dayHasSlot(ALL, 4, 5)).toBe(false); // 周四专属只有 4 节
    expect(dayHasSlot(ALL, 4, 3)).toBe(true);
  });
});

describe("breaksIn / breakAfter", () => {
  it("推导相邻节次之间的课间", () => {
    const mondayBreaks = breaksIn(slotsForDay(ALL, 1));
    // 08:45→08:55=10；09:40→10:00=20；10:45→10:55=10；11:40→12:00=20；12:45→12:55=10
    expect(mondayBreaks.map((b) => b.minutes)).toEqual([10, 20, 10, 20, 10]);
  });

  it("首尾相接（12:00 结束 12:00 开始）不产生课间", () => {
    const tight = [slot(1, "08:00", "09:00"), slot(2, "09:00", "10:00")];
    expect(breaksIn(tight)).toHaveLength(0);
  });

  it("breakAfter 查询指定节次之后的课间", () => {
    expect(breakAfter(ALL, 1, 4)).toBe(20);
    expect(breakAfter(ALL, 4, 4)).toBe(0); // 周四第 4 节是最后一节
  });
});
