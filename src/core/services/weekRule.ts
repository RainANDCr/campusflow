import type { WeekRule } from "@/core/models";

function intRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let w = Math.max(1, Math.trunc(from)); w <= to; w++) out.push(w);
  return out;
}

/**
 * 将周次规则解析为具体的教学周列表（1-based，升序，去重）。
 * totalWeeks < 1 时返回空数组；范围与自定义周次越界部分会被截断/过滤。
 */
export function resolveWeeks(rule: WeekRule, totalWeeks: number): number[] {
  if (totalWeeks < 1) return [];
  const max = Math.min(Math.trunc(totalWeeks), 60);
  switch (rule.type) {
    case "all":
      return intRange(1, max);
    case "odd": {
      const out: number[] = [];
      for (let w = 1; w <= max; w += 2) out.push(w);
      return out;
    }
    case "even": {
      const out: number[] = [];
      for (let w = 2; w <= max; w += 2) out.push(w);
      return out;
    }
    case "range": {
      if (rule.from > rule.to) return [];
      return intRange(rule.from, Math.min(rule.to, max)).filter(
        (w) => w >= rule.from,
      );
    }
    case "custom": {
      const set = new Set(
        rule.weeks.filter((w) => w >= 1 && w <= max),
      );
      return [...set].sort((a, b) => a - b);
    }
  }
}

/** 某个教学周是否命中规则。 */
export function weekRuleContains(
  rule: WeekRule,
  week: number,
  totalWeeks: number,
): boolean {
  return resolveWeeks(rule, totalWeeks).includes(week);
}

/** 周次规则的中文描述，用于课程卡片与详情页。 */
export function weekRuleLabel(rule: WeekRule): string {
  switch (rule.type) {
    case "all":
      return "每周";
    case "odd":
      return "单周";
    case "even":
      return "双周";
    case "range":
      return `第 ${rule.from}-${rule.to} 周`;
    case "custom":
      return `第 ${rule.weeks.join("、")} 周`;
  }
}
