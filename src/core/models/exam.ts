import { z } from "zod";
import { zBaseEntity, zHHmm, zIsoDate } from "./common";

/** 考试类型（模块 07 #13-16）。 */
export const EXAM_KINDS = ["normal", "midterm", "final", "makeup", "deferred"] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  normal: "常规",
  midterm: "期中",
  final: "期末",
  makeup: "补考",
  deferred: "缓考",
};

/** 考试安排。date 为考试日期，倒计时由 UI 根据当前日期计算。 */
export const zExam = zBaseEntity
  .extend({
    semesterId: z.string().min(1),
    courseId: z.string().min(1).optional(),
    name: z.string().trim().min(1, "考试名称不能为空").max(80, "考试名称过长"),
    date: zIsoDate,
    startTime: zHHmm,
    endTime: zHHmm,
    building: z.string().trim().max(40).optional(),
    room: z.string().trim().max(40).optional(),
    seat: z.string().trim().max(20).optional(),
    kind: z.enum(EXAM_KINDS).optional(),
    /** 重要程度（模块 07 #12） */
    priority: z.enum(["high", "normal"]).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((e) => e.endTime > e.startTime, {
    message: "结束时间需晚于开始时间",
  });
export type Exam = z.infer<typeof zExam>;
