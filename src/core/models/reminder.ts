import { z } from "zod";
import { zBaseEntity } from "./common";

export const REMINDER_KINDS = ["class", "exam", "event"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  class: "上课提醒",
  exam: "考试提醒",
  event: "日程提醒",
};

/**
 * 提醒规则。scope=global 为全局默认，scope=course 时必须关联课程，
 * 用于为单门课程覆盖全局设置（如某门课提前 30 分钟提醒）。
 * minutesBefore 为提前分钟数（自定义时 1～1440）。
 */
export const zReminderRule = zBaseEntity
  .extend({
    scope: z.enum(["global", "course"]),
    kind: z.enum(REMINDER_KINDS),
    courseId: z.string().min(1).optional(),
    minutesBefore: z.number().int().min(1).max(1440),
    enabled: z.boolean(),
  })
  .refine((r) => r.scope === "global" || r.courseId !== undefined, {
    message: "课程级提醒必须关联课程",
  });
export type ReminderRule = z.infer<typeof zReminderRule>;

/** 常用提醒提前量选项（分钟）。 */
export const PRESET_MINUTES_BEFORE = [5, 10, 15, 30] as const;
