import { z } from "zod";

/**
 * 周次规则 —— 课程“在哪些教学周上课”的唯一数据结构。
 * 单双周以用户设定的教学周序号计算（第 1 周为开学所在周），
 * 与自然日历周无关。
 *
 * - all    ：每个教学周都上
 * - odd    ：单周（第 1、3、5…周）
 * - even   ：双周（第 2、4、6…周）
 * - range  ：连续区间，如第 1～8 周
 * - custom ：任意不连续周次，如第 1、3、5、7 周
 */
export const zWeekRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("odd") }),
  z.object({ type: z.literal("even") }),
  z.object({
    type: z.literal("range"),
    from: z.number().int().min(1).max(60),
    to: z.number().int().min(1).max(60),
  }),
  z.object({
    type: z.literal("custom"),
    weeks: z.array(z.number().int().min(1).max(60)).min(1),
  }),
]);
export type WeekRule = z.infer<typeof zWeekRule>;
