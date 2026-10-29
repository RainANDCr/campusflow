import { z } from "zod";
import { zBaseEntity, zHHmm, zIsoDate } from "./common";

export const EVENT_CATEGORIES = [
  "personal",
  "activity",
  "important",
  "todo",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  personal: "个人日程",
  activity: "临时活动",
  important: "重要日期",
  todo: "待办",
};

/** 日程重复规则（模块 11 #16）：不重复 / 每周（按锚定日星期）/ 每年（按月日，如生日）。 */
export const EVENT_REPEATS = ["none", "weekly", "yearly"] as const;
export type EventRepeat = (typeof EVENT_REPEATS)[number];

export const EVENT_REPEAT_LABELS: Record<EventRepeat, string> = {
  none: "不重复",
  weekly: "每周",
  yearly: "每年",
};

/** 待办优先级（模块 08 #6）。 */
export const TASK_PRIORITIES = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/** 个人日程 / 临时活动 / 重要日期 / 待办。与课程共用课表展示，但使用独立视觉标识。 */
export const zScheduleEvent = zBaseEntity
  .extend({
    semesterId: z.string().min(1).optional(),
    /** 关联课程（课程待办场景），普通日程不填 */
    courseId: z.string().min(1).optional(),
    title: z.string().trim().min(1, "标题不能为空").max(80, "标题过长"),
    date: zIsoDate,
    allDay: z.boolean(),
    startTime: zHHmm.optional(),
    endTime: zHHmm.optional(),
    category: z.enum(EVENT_CATEGORIES),
    color: z.string().max(20).optional(),
    note: z.string().max(500).optional(),
    done: z.boolean().optional(),
    /** 重复规则；date 为锚定日（每周=该日星期，每年=该月日） */
    repeat: z.enum(EVENT_REPEATS).optional(),
    /** 待办优先级（category=todo 时有意义） */
    priority: z.enum(TASK_PRIORITIES).optional(),
  })
  .refine((e) => e.allDay || e.startTime !== undefined, {
    message: "非全天日程需要开始时间",
  });
export type ScheduleEvent = z.infer<typeof zScheduleEvent>;
