import { describe, expect, it } from "vitest";
import type { ConflictableSession } from "./conflict";
import { describeConflict, findConflicts } from "./conflict";

function s(overrides: Partial<ConflictableSession>): ConflictableSession {
  return {
    key: "k",
    label: "课程",
    dayOfWeek: 1,
    startSlot: 1,
    endSlot: 2,
    weekRule: { type: "all" },
    ...overrides,
  };
}

describe("findConflicts", () => {
  it("同天同时段全周重叠 → 冲突", () => {
    const list = [
      s({ key: "a", label: "数学" }),
      s({ key: "b", label: "英语" }),
    ];
    const result = findConflicts(list, 20);
    expect(result).toHaveLength(1);
    expect(result[0]?.weeks).toHaveLength(20);
  });

  it("周次不相交则不冲突（1-8 周 vs 9-16 周）", () => {
    const list = [
      s({ key: "a", weekRule: { type: "range", from: 1, to: 8 } }),
      s({ key: "b", weekRule: { type: "range", from: 9, to: 16 } }),
    ];
    expect(findConflicts(list, 20)).toHaveLength(0);
  });

  it("节次错开则不冲突", () => {
    const list = [
      s({ key: "a", startSlot: 1, endSlot: 2 }),
      s({ key: "b", startSlot: 3, endSlot: 4 }),
    ];
    expect(findConflicts(list, 20)).toHaveLength(0);
  });

  it("节次相交（部分重叠）即冲突", () => {
    const list = [
      s({ key: "a", startSlot: 1, endSlot: 3 }),
      s({ key: "b", startSlot: 3, endSlot: 4 }),
    ];
    const result = findConflicts(list, 20);
    expect(result).toHaveLength(1);
    expect(result[0]?.startSlot).toBe(3);
    expect(result[0]?.endSlot).toBe(3);
  });

  it("不同星期不冲突", () => {
    const list = [s({ key: "a", dayOfWeek: 1 }), s({ key: "b", dayOfWeek: 2 })];
    expect(findConflicts(list, 20)).toHaveLength(0);
  });

  it("单双周错开不冲突", () => {
    const list = [
      s({ key: "a", weekRule: { type: "odd" } }),
      s({ key: "b", weekRule: { type: "even" } }),
    ];
    expect(findConflicts(list, 20)).toHaveLength(0);
  });

  it("三条安排两两冲突输出三组", () => {
    const list = [s({ key: "a" }), s({ key: "b" }), s({ key: "c" })];
    expect(findConflicts(list, 20)).toHaveLength(3);
  });
});

describe("describeConflict", () => {
  it("生成中文描述", () => {
    const text = describeConflict({
      aKey: "a",
      bKey: "b",
      aLabel: "高等数学",
      bLabel: "大学英语",
      dayOfWeek: 3,
      startSlot: 3,
      endSlot: 4,
      weeks: [1, 3, 5],
    });
    expect(text).toContain("高等数学");
    expect(text).toContain("大学英语");
    expect(text).toContain("周三");
    expect(text).toContain("第 3-4 节");
    expect(text).toContain("1、3、5");
  });
});
