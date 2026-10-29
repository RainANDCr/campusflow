import { z } from "zod";
import { zBaseEntity, zIsoDate } from "./common";

/** 每周起始日：0 = 周日，1 = 周一（默认）。仅影响展示顺序，不影响数据。 */
export const zWeekStartsOn = z.union([z.literal(0), z.literal(1)]);
export type WeekStartsOn = 0 | 1;

/** 特殊教学周类型（模块 04 #12/15/16）：考试周、集中实训周、假期周、自定义。 */
export const SPECIAL_WEEK_KINDS = ["exam", "training", "holiday", "custom"] as const;
export type SpecialWeekKind = (typeof SPECIAL_WEEK_KINDS)[number];

export const SPECIAL_WEEK_LABELS: Record<SpecialWeekKind, string> = {
  exam: "考试周",
  training: "实训周",
  holiday: "假期周",
  custom: "特殊周",
};

export interface SpecialWeek {
  week: number;
  kind: SpecialWeekKind;
  label?: string;
}

/**
 * 学期。开学日期与第一周锚点分离：
 * - startDate     开学日期（如 2026-09-01，可能是周二）
 * - weekOneAnchor 第一教学周的第一天（默认为开学日期所在周的第一天，
 *                 可由用户调整），是教学周计算的基准
 * - specialWeeks  特殊教学周标注（可选；字段新增不影响旧数据与索引）
 */
export const zSemester = zBaseEntity.extend({
  name: z.string().trim().min(1, "学期名称不能为空").max(60, "学期名称过长"),
  startDate: zIsoDate,
  weekOneAnchor: zIsoDate,
  totalWeeks: z
    .number()
    .int()
    .min(1, "至少 1 个教学周")
    .max(40, "教学周数最多 40 周"),
  weekStartsOn: zWeekStartsOn,
  status: z.enum(["current", "archived"]),
  specialWeeks: z
    .array(
      z.object({
        week: z.number().int().min(1).max(40),
        kind: z.enum(SPECIAL_WEEK_KINDS),
        label: z.string().trim().max(20).optional(),
      }),
    )
    .max(40)
    .optional(),
});
export type Semester = z.infer<typeof zSemester>;

/** 某教学周的特殊标注（无则 undefined）。 */
export function specialWeekOf(
  semester: Semester,
  week: number,
): SpecialWeek | undefined {
  return semester.specialWeeks?.find((w) => w.week === week);
}
