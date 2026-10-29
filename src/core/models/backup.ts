import { z } from "zod";
import type { Course, CourseSession } from "./course";
import type { CourseException } from "./exception";
import type { Exam } from "./exam";
import type { PreferenceRecord } from "./preferences";
import type { TimetableProfile } from "./profile";
import type { ReminderRule } from "./reminder";
import type { ScheduleEvent } from "./scheduleEvent";
import type { Semester } from "./semester";
import type { ClassTimeSlot } from "./timeSlot";

/** 备份文件头部的元信息，同时用于本地自动备份记录。 */
export interface BackupMetadata {
  id: string;
  createdAt: number;
  /** 生成备份时的数据库 schema 版本 */
  schemaVersion: number;
  appVersion: string;
  counts: Record<string, number>;
  note?: string;
}

/** JSON 备份文件的完整结构（导出/导入共用）。timetableProfiles 为 v2 新增，旧备份缺省。 */
export interface BackupFile {
  meta: BackupMetadata;
  data: {
    semesters?: Semester[];
    courses?: Course[];
    courseSessions?: CourseSession[];
    courseExceptions?: CourseException[];
    timeSlots?: ClassTimeSlot[];
    timetableProfiles?: TimetableProfile[];
    scheduleEvents?: ScheduleEvent[];
    exams?: Exam[];
    reminderRules?: ReminderRule[];
    preferences?: PreferenceRecord[];
  };
}

/** 导入备份时逐表校验；表缺失视为空。 */
export const zBackupFile = z.object({
  meta: z.object({
    id: z.string().min(1),
    createdAt: z.number(),
    schemaVersion: z.number().int().nonnegative(),
    appVersion: z.string(),
    counts: z.record(z.string(), z.number()),
    note: z.string().optional(),
  }),
  data: z.object({
    semesters: z.array(z.unknown()).optional(),
    courses: z.array(z.unknown()).optional(),
    courseSessions: z.array(z.unknown()).optional(),
    courseExceptions: z.array(z.unknown()).optional(),
    timeSlots: z.array(z.unknown()).optional(),
    timetableProfiles: z.array(z.unknown()).optional(),
    scheduleEvents: z.array(z.unknown()).optional(),
    exams: z.array(z.unknown()).optional(),
    reminderRules: z.array(z.unknown()).optional(),
    preferences: z.array(z.unknown()).optional(),
  }),
});
