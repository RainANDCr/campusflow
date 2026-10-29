import { z } from "zod";
import { zBaseEntity } from "./common";
import { zWeekRule } from "./weekRule";

export const COURSE_TYPES = [
  "lecture",
  "lab",
  "sport",
  "seminar",
  "elective",
  "online",
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  lecture: "理论课",
  lab: "实验课",
  sport: "体育课",
  seminar: "研讨课",
  elective: "选修课",
  online: "网课",
};

/**
 * 课程（静态信息）。课程的上课时间安排放在 CourseSession 中：
 * 一门课程可以拥有多个上课安排（不同星期、不同周次、不同教室/教师）。
 * color 为课程配色方案中的色板 ID，渲染时映射为具体颜色。
 * tags 为自由标签（可搜索/筛选）；classGroup 标识教学班（同课多班）；
 * profileId 指向学期内的课表方案（TimetableProfile），缺省时归入主方案。
 */
export const zCourse = zBaseEntity.extend({
  semesterId: z.string().min(1),
  name: z.string().trim().min(1, "课程名称不能为空").max(80, "课程名称过长"),
  teacher: z.string().trim().max(40).optional(),
  building: z.string().trim().max(40).optional(),
  room: z.string().trim().max(40).optional(),
  type: z.enum(COURSE_TYPES),
  color: z.string().min(1).max(20),
  icon: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
  classGroup: z.string().trim().max(40).optional(),
  profileId: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
});
export type Course = z.infer<typeof zCourse>;

/**
 * 上课安排（一门课的一次重复规则）。
 * - dayOfWeek 固定 1=周一 … 7=周日（ISO 约定），展示顺序由学期 weekStartsOn 决定
 * - startSlot / endSlot 引用学期 ClassTimeSlot 的 index（1-based）
 * - weekRule 决定该安排在哪些教学周生效
 * - teacher / building / room 可按安排覆盖课程默认值，
 *   配合不同 weekRule 即可实现“不同周次不同教师 / 跨周不同教室”
 */
export const zCourseSession = zBaseEntity
  .extend({
    courseId: z.string().min(1),
    semesterId: z.string().min(1),
    dayOfWeek: z.number().int().min(1).max(7),
    startSlot: z.number().int().min(1).max(30),
    endSlot: z.number().int().min(1).max(30),
    weekRule: zWeekRule,
    teacher: z.string().trim().max(40).optional(),
    building: z.string().trim().max(40).optional(),
    room: z.string().trim().max(40).optional(),
    note: z.string().max(300).optional(),
  })
  .refine((s) => s.endSlot >= s.startSlot, {
    message: "结束节次不能早于起始节次",
  });
export type CourseSession = z.infer<typeof zCourseSession>;
