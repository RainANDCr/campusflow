import { z } from "zod";
import { zBaseEntity } from "./common";

/**
 * 课表方案（同一学期内的多套独立课表，如“主课表 / 备选方案 / 试听课表”）。
 * isPrimary 使用 0|1 整数存储：IndexedDB 主键索引不支持布尔值。
 * 每个学期至少有一个主方案；课程通过 profileId 归属到方案。
 */
export const zTimetableProfile = zBaseEntity.extend({
  semesterId: z.string().min(1),
  name: z.string().trim().min(1, "课表方案名称不能为空").max(40, "方案名称过长"),
  isPrimary: z.union([z.literal(0), z.literal(1)]),
  order: z.number().int().nonnegative(),
});
export type TimetableProfile = z.infer<typeof zTimetableProfile>;
