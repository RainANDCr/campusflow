import type { ClassTimeSlot } from "@/core/models";

/**
 * 节次作息解析服务。
 * 语义：某天存在专属节次（带 dayOfWeek）时，该天整日使用专属作息；
 * 否则使用通用作息（dayOfWeek 缺省的节次）。
 * 课间休息由相邻节次的时间间隔推导，不作为独立实体存储。
 */

/** 按节次序号排序。 */
export function sortSlots(slots: ClassTimeSlot[]): ClassTimeSlot[] {
  return [...slots].sort((a, b) => a.index - b.index);
}

/** 某天的有效作息：有专属用专属，否则用通用作息。 */
export function slotsForDay(
  allSlots: ClassTimeSlot[],
  dayOfWeek: number,
): ClassTimeSlot[] {
  const daySpecific = sortSlots(
    allSlots.filter((s) => s.dayOfWeek === dayOfWeek),
  );
  if (daySpecific.length > 0) return daySpecific;
  return sortSlots(allSlots.filter((s) => s.dayOfWeek === undefined));
}

/** 通用作息（每周都适用的基础节次）。 */
export function baseSlots(allSlots: ClassTimeSlot[]): ClassTimeSlot[] {
  return sortSlots(allSlots.filter((s) => s.dayOfWeek === undefined));
}

/** 该天某节次是否存在（用于判断会话引用是否有效）。 */
export function dayHasSlot(
  allSlots: ClassTimeSlot[],
  dayOfWeek: number,
  index: number,
): boolean {
  return slotsForDay(allSlots, dayOfWeek).some((s) => s.index === index);
}

export interface SlotBreak {
  /** 第 afterIndex 节之后的课间 */
  afterIndex: number;
  /** 课间分钟数（相邻节次首尾相接时为 0，不产生条目） */
  minutes: number;
}

/** 推导某天作息中的课间休息（相邻节次的时间间隔）。 */
export function breaksIn(slots: ClassTimeSlot[]): SlotBreak[] {
  const sorted = sortSlots(slots);
  const out: SlotBreak[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (!cur || !next) continue;
    const minutes =
      Number(next.startTime.slice(0, 2)) * 60 +
      Number(next.startTime.slice(3, 5)) -
      (Number(cur.endTime.slice(0, 2)) * 60 + Number(cur.endTime.slice(3, 5)));
    if (minutes > 0) {
      out.push({ afterIndex: cur.index, minutes });
    }
  }
  return out;
}

/** 找出某天在第 afterIndex 节之后的课间时长（无则 0）。 */
export function breakAfter(
  allSlots: ClassTimeSlot[],
  dayOfWeek: number,
  afterIndex: number,
): number {
  return breaksIn(slotsForDay(allSlots, dayOfWeek)).find(
    (b) => b.afterIndex === afterIndex,
  )?.minutes ?? 0;
}

/**
 * 某天的空闲节次序号（有效作息中未被任何课程占用的节次）。
 * 空课时段按具体日期与该天有效作息计算，专属作息外的节次不算空课。
 */
export function freeSlotIndexes(
  occupied: Array<{ startSlot: number; endSlot: number }>,
  effectiveSlots: ClassTimeSlot[],
): number[] {
  const occupiedIdx = new Set<number>();
  for (const o of occupied) {
    for (let i = o.startSlot; i <= o.endSlot; i++) occupiedIdx.add(i);
  }
  return sortSlots(effectiveSlots)
    .filter((s) => !occupiedIdx.has(s.index))
    .map((s) => s.index);
}

/** 把连续的节次序号合并为区间描述（[1,2,5] → [[1,2],[5,5]]）。 */
export function groupConsecutive(indexes: number[]): Array<[number, number]> {
  const sorted = [...indexes].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const idx of sorted) {
    if (start === null) {
      start = idx;
      prev = idx;
      continue;
    }
    if (prev !== null && idx === prev + 1) {
      prev = idx;
    } else {
      out.push([start, prev ?? start]);
      start = idx;
      prev = idx;
    }
  }
  if (start !== null) out.push([start, prev ?? start]);
  return out;
}
