import { describe, expect, it } from "vitest";
import type { WeekRule } from "@/core/models";
import { resolveWeeks, weekRuleContains, weekRuleLabel } from "./weekRule";

describe("resolveWeeks", () => {
  it("all：返回全部教学周", () => {
    expect(resolveWeeks({ type: "all" }, 4)).toEqual([1, 2, 3, 4]);
  });

  it("odd：单周", () => {
    expect(resolveWeeks({ type: "odd" }, 20)).toEqual([
      1, 3, 5, 7, 9, 11, 13, 15, 17, 19,
    ]);
  });

  it("even：双周", () => {
    expect(resolveWeeks({ type: "even" }, 20)).toEqual([
      2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
    ]);
  });

  it("range：第 1-8 周", () => {
    expect(resolveWeeks({ type: "range", from: 1, to: 8 }, 20)).toEqual(
      Array.from({ length: 8 }, (_, i) => i + 1),
    );
  });

  it("range：越界部分被截断到总周数", () => {
    expect(resolveWeeks({ type: "range", from: 15, to: 40 }, 20)).toEqual(
      Array.from({ length: 6 }, (_, i) => i + 15),
    );
  });

  it("range：起止颠倒返回空数组", () => {
    expect(resolveWeeks({ type: "range", from: 8, to: 1 }, 20)).toEqual([]);
  });

  it("custom：去重、升序、过滤越界周次", () => {
    expect(
      resolveWeeks({ type: "custom", weeks: [9, 1, 3, 3, 25] }, 20),
    ).toEqual([1, 3, 9]);
  });

  it("totalWeeks < 1：返回空数组", () => {
    expect(resolveWeeks({ type: "all" }, 0)).toEqual([]);
    expect(resolveWeeks({ type: "custom", weeks: [1, 2] }, -3)).toEqual([]);
  });

  it("总周数为小数时按截断处理", () => {
    expect(resolveWeeks({ type: "all" }, 20.9)).toHaveLength(20);
  });
});

describe("weekRuleContains", () => {
  const cases: Array<[WeekRule, number, number, boolean]> = [
    [{ type: "all" }, 5, 20, true],
    [{ type: "odd" }, 3, 20, true],
    [{ type: "odd" }, 4, 20, false],
    [{ type: "even" }, 20, 20, true],
    [{ type: "range", from: 1, to: 8 }, 8, 20, true],
    [{ type: "range", from: 1, to: 8 }, 9, 20, false],
    [{ type: "custom", weeks: [1, 3, 5, 7] }, 5, 20, true],
    [{ type: "custom", weeks: [1, 3, 5, 7] }, 2, 20, false],
    // 越界周次即使出现在规则里也不算命中
    [{ type: "custom", weeks: [25] }, 25, 20, false],
  ];

  it.each(cases)("规则 %j 第 %i 周（总 %i 周）→ %j", (rule, week, total, hit) => {
    expect(weekRuleContains(rule, week, total)).toBe(hit);
  });
});

describe("weekRuleLabel", () => {
  it("输出中文描述", () => {
    expect(weekRuleLabel({ type: "all" })).toBe("每周");
    expect(weekRuleLabel({ type: "odd" })).toBe("单周");
    expect(weekRuleLabel({ type: "even" })).toBe("双周");
    expect(weekRuleLabel({ type: "range", from: 9, to: 16 })).toBe("第 9-16 周");
    expect(weekRuleLabel({ type: "custom", weeks: [1, 3, 5, 7] })).toBe(
      "第 1、3、5、7 周",
    );
  });
});
