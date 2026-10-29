import { z } from "zod";

/**
 * 本地日期，格式 yyyy-MM-dd。
 * 约定：始终表示用户本地日历日，不带时区偏移；
 * 解析时使用本地时区的零点（date-fns parseISO 行为）。
 */
export type ISODate = string;

/** 本地时间，24 小时制 HH:mm。仅用于展示与排序，不做时区换算。 */
export type HHmmTime = string;

/** 时间戳（毫秒），用于 createdAt / updatedAt 等元数据。 */
export type EpochMs = number;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const zIsoDate = z
  .string()
  .regex(ISO_DATE_PATTERN, "日期需为 yyyy-MM-dd 格式");
export const zHHmm = z
  .string()
  .regex(HHMM_PATTERN, "时间需为 HH:mm（24 小时制）");
export const zTimestamp = z.number().int().nonnegative();

/** 所有实体的公共字段：稳定唯一 ID + 审计时间戳。 */
export const zBaseEntity = z.object({
  id: z.string().min(1),
  createdAt: zTimestamp,
  updatedAt: zTimestamp,
});
export interface BaseEntity {
  id: string;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
