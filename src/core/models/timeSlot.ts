import { z } from "zod";
import { zBaseEntity, zHHmm } from "./common";

/**
 * 节次时间配置（每学期独立）。
 * index 为节次序号（1-based）；startTime / endTime 为 HH:mm，
 * 字符串比较即可判断先后（定宽 24 小时制）。
 * 节数与每节时间完全由用户自定义。
 *
 * dayOfWeek 缺省 = 通用作息（适用于没有专属作息的每一天）；
 * 某天存在任一带 dayOfWeek 的专属节次时，该天完全使用专属作息（整日替换语义）。
 */
export const zClassTimeSlot = zBaseEntity
  .extend({
    semesterId: z.string().min(1),
    index: z.number().int().min(1).max(30),
    name: z.string().trim().max(20).optional(),
    startTime: zHHmm,
    endTime: zHHmm,
    dayOfWeek: z.number().int().min(1).max(7).optional(),
  })
  .refine((s) => s.endTime > s.startTime, {
    message: "结束时间需晚于开始时间",
  });
export type ClassTimeSlot = z.infer<typeof zClassTimeSlot>;

/** 常见大学作息模板（创建学期时作为初始值，可自由修改）。 */
export const DEFAULT_SLOT_TEMPLATE: Array<{
  index: number;
  startTime: string;
  endTime: string;
}> = [
  { index: 1, startTime: "08:00", endTime: "08:45" },
  { index: 2, startTime: "08:55", endTime: "09:40" },
  { index: 3, startTime: "10:00", endTime: "10:45" },
  { index: 4, startTime: "10:55", endTime: "11:40" },
  { index: 5, startTime: "12:00", endTime: "12:45" },
  { index: 6, startTime: "12:55", endTime: "13:40" },
  { index: 7, startTime: "14:00", endTime: "14:45" },
  { index: 8, startTime: "14:55", endTime: "15:40" },
  { index: 9, startTime: "16:00", endTime: "16:45" },
  { index: 10, startTime: "16:55", endTime: "17:40" },
  { index: 11, startTime: "19:00", endTime: "19:45" },
  { index: 12, startTime: "19:55", endTime: "20:40" },
];
