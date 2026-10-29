import {
  DEFAULT_SLOT_TEMPLATE,
  createId,
  zClassTimeSlot,
  type ClassTimeSlot,
} from "@/core/models";
import { db } from "./dexie";

/**
 * 整体替换某学期的节次时间配置。
 * index 按 1..n 重排（通用作息与每个专属作息各自从 1 编号）；
 * 任何一节结束时间不晚于开始时间即整体失败。
 */
export async function replaceTimeSlots(
  semesterId: string,
  inputs: Array<{ name?: string; startTime: string; endTime: string; dayOfWeek?: number }>,
): Promise<void> {
  if (inputs.length === 0) throw new Error("至少保留一个节次");
  // 通用作息与各专属作息分别从 1 编号
  const counters = new Map<number | "base", number>();
  const slots: ClassTimeSlot[] = inputs.map((input) => {
    const group = input.dayOfWeek ?? "base";
    const nextIndex = (counters.get(group) ?? 0) + 1;
    counters.set(group, nextIndex);
    const candidate: ClassTimeSlot = {
      id: createId(),
      semesterId,
      index: nextIndex,
      name: input.name?.trim() || undefined,
      startTime: input.startTime,
      endTime: input.endTime,
      dayOfWeek: input.dayOfWeek,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const parsed = zClassTimeSlot.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `第 ${nextIndex} 节（${group === "base" ? "通用" : `周${input.dayOfWeek}`}）：${parsed.error.issues[0]?.message ?? "时间不合法"}`,
      );
    }
    return parsed.data;
  });
  await db.transaction("rw", db.timeSlots, async () => {
    await db.timeSlots.where("semesterId").equals(semesterId).delete();
    await db.timeSlots.bulkAdd(slots);
  });
}

/** 创建学期时生成默认节次模板。 */
export async function ensureDefaultTimeSlots(semesterId: string): Promise<void> {
  const existing = await db.timeSlots
    .where("semesterId")
    .equals(semesterId)
    .count();
  if (existing > 0) return;
  await replaceTimeSlots(
    semesterId,
    DEFAULT_SLOT_TEMPLATE.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
  );
}
