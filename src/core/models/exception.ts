import { z } from "zod";
import { zBaseEntity, zIsoDate } from "./common";

/**
 * 课程例外 —— 临时调课 / 停课 / 补课。
 * 独立于重复规则存储，不修改原始 CourseSession：
 * - cancel（停课）：某次原课不上，定位 = sessionId + originalDate
 * - adjust（调课）：某次原课变更日期/节次/教室/教师，至少修改一项
 * - extra （补课）：在重复规则之外新增一次上课，必须指定日期与节次
 */
export const zCourseException = z.discriminatedUnion("kind", [
  zBaseEntity.extend({
    kind: z.literal("cancel"),
    semesterId: z.string().min(1),
    courseId: z.string().min(1),
    sessionId: z.string().min(1),
    originalDate: zIsoDate,
    note: z.string().max(300).optional(),
  }),
  zBaseEntity
    .extend({
      kind: z.literal("adjust"),
      semesterId: z.string().min(1),
      courseId: z.string().min(1),
      sessionId: z.string().min(1),
      originalDate: zIsoDate,
      newDate: zIsoDate.optional(),
      newStartSlot: z.number().int().min(1).max(30).optional(),
      newEndSlot: z.number().int().min(1).max(30).optional(),
      newBuilding: z.string().trim().max(40).optional(),
      newRoom: z.string().trim().max(40).optional(),
      newTeacher: z.string().trim().max(40).optional(),
      note: z.string().max(300).optional(),
    })
    .refine(
      (a) =>
        a.newDate !== undefined ||
        a.newStartSlot !== undefined ||
        a.newEndSlot !== undefined ||
        a.newBuilding !== undefined ||
        a.newRoom !== undefined ||
        a.newTeacher !== undefined,
      { message: "调课至少需要修改一项内容" },
    )
    .refine(
      (a) => (a.newStartSlot === undefined) === (a.newEndSlot === undefined),
      { message: "节次变更需同时指定开始与结束节次" },
    ),
  zBaseEntity
    .extend({
      kind: z.literal("extra"),
      semesterId: z.string().min(1),
      courseId: z.string().min(1),
      date: zIsoDate,
      startSlot: z.number().int().min(1).max(30),
      endSlot: z.number().int().min(1).max(30),
      building: z.string().trim().max(40).optional(),
      room: z.string().trim().max(40).optional(),
      teacher: z.string().trim().max(40).optional(),
      note: z.string().max(300).optional(),
    })
    .refine((e) => e.endSlot >= e.startSlot, {
      message: "结束节次不能早于起始节次",
    }),
]);
export type CourseException = z.infer<typeof zCourseException>;
export type ExceptionKind = CourseException["kind"];

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  cancel: "停课",
  adjust: "调课",
  extra: "补课",
};
