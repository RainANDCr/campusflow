import type { WeekRule } from "@/core/models";
import { resolveWeeks } from "./weekRule";

/** 参与冲突检测的最小排课形状。label 用于生成可读的冲突描述。 */
export interface ConflictableSession {
  key: string;
  label: string;
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
  weekRule: WeekRule;
}

export interface SessionConflict {
  aKey: string;
  bKey: string;
  aLabel: string;
  bLabel: string;
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
  /** 双方同时上课的教学周 */
  weeks: number[];
}

function slotRangesIntersect(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * 在一组排课中找出全部时间冲突：
 * 同一星期 × 节次区间相交 × 教学周集合相交。
 * O(n²) 对课表规模（几十条安排）完全够用。
 */
export function findConflicts(
  sessions: ConflictableSession[],
  totalWeeks: number,
): SessionConflict[] {
  const out: SessionConflict[] = [];
  const resolved = sessions.map((s) => ({
    s,
    weeks: new Set(resolveWeeks(s.weekRule, totalWeeks)),
  }));
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a || !b) continue;
      if (a.s.dayOfWeek !== b.s.dayOfWeek) continue;
      if (
        !slotRangesIntersect(
          [a.s.startSlot, a.s.endSlot],
          [b.s.startSlot, b.s.endSlot],
        )
      )
        continue;
      const shared = [...a.weeks].filter((w) => b.weeks.has(w)).sort((x, y) => x - y);
      if (shared.length === 0) continue;
      out.push({
        aKey: a.s.key,
        bKey: b.s.key,
        aLabel: a.s.label,
        bLabel: b.s.label,
        dayOfWeek: a.s.dayOfWeek,
        startSlot: Math.max(a.s.startSlot, b.s.startSlot),
        endSlot: Math.min(a.s.endSlot, b.s.endSlot),
        weeks: shared,
      });
    }
  }
  return out;
}

/** 冲突的中文描述（用于表单警告）。 */
export function describeConflict(c: SessionConflict): string {
  const day = "一二三四五六日"[c.dayOfWeek - 1] ?? c.dayOfWeek;
  const weeks =
    c.weeks.length > 6
      ? `${c.weeks.length} 个周次`
      : `第 ${c.weeks.join("、")} 周`;
  return `「${c.aLabel}」与「${c.bLabel}」：周${day} 第 ${c.startSlot}-${c.endSlot} 节，${weeks}重叠`;
}
