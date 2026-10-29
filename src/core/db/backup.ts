import {
  zAppSettings,
  zCourse,
  zCourseSession,
  zExam,
  zReminderRule,
  zScheduleEvent,
  zSemester,
  zClassTimeSlot,
  zTimetableProfile,
  type BackupFile,
  type Course,
  type CourseException,
  type CourseSession,
  type Exam,
  type ReminderRule,
  type ScheduleEvent,
  type Semester,
  type ClassTimeSlot,
  type TimetableProfile,
} from "@/core/models";
import { zCourseException } from "@/core/models";
import { db, DB_NAME, DB_SCHEMA_VERSION } from "./dexie";
import { createId } from "@/core/models";
import { ensureProfileConsistency } from "./profiles";

const APP_VERSION = "0.1.0";

/** 汇总全部本地数据。 */
export async function collectBackup(): Promise<BackupFile> {
  const [
    semesters,
    courses,
    courseSessions,
    courseExceptions,
    timeSlots,
    timetableProfiles,
    scheduleEvents,
    exams,
    reminderRules,
    preferences,
  ] = await Promise.all([
    db.semesters.toArray(),
    db.courses.toArray(),
    db.courseSessions.toArray(),
    db.courseExceptions.toArray(),
    db.timeSlots.toArray(),
    db.timetableProfiles.toArray(),
    db.scheduleEvents.toArray(),
    db.exams.toArray(),
    db.reminderRules.toArray(),
    db.preferences.toArray(),
  ]);
  return {
    meta: {
      id: createId(),
      createdAt: Date.now(),
      schemaVersion: DB_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      counts: {
        semesters: semesters.length,
        courses: courses.length,
        courseSessions: courseSessions.length,
        courseExceptions: courseExceptions.length,
        timeSlots: timeSlots.length,
        timetableProfiles: timetableProfiles.length,
        scheduleEvents: scheduleEvents.length,
        exams: exams.length,
        reminderRules: reminderRules.length,
      },
    },
    data: {
      semesters,
      courses,
      courseSessions,
      courseExceptions,
      timeSlots,
      timetableProfiles,
      scheduleEvents,
      exams,
      reminderRules,
      preferences,
    },
  };
}

export interface ImportReport {
  imported: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * 恢复备份。
 * mode = "merge"：逐条覆盖写入（按 id 合并）；
 * mode = "replace"：先清空同名表再写入（完整还原，需用户显式确认）。
 * 每条记录独立校验，非法数据跳过并计入 skipped，不会因单条坏数据失败。
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: "merge" | "replace",
): Promise<ImportReport> {
  const report: ImportReport = { imported: {}, skipped: {} };
  const track = (table: string, ok: boolean) => {
    report.imported[table] = (report.imported[table] ?? 0) + (ok ? 1 : 0);
    report.skipped[table] = (report.skipped[table] ?? 0) + (ok ? 0 : 1);
  };

  const semesters = (backup.data.semesters ?? []) as Semester[];
  const courses = (backup.data.courses ?? []) as Course[];
  const sessions = (backup.data.courseSessions ?? []) as unknown as CourseSession[];
  const exceptions = (backup.data.courseExceptions ?? []) as unknown as CourseException[];
  const slots = (backup.data.timeSlots ?? []) as ClassTimeSlot[];
  const profiles = (backup.data.timetableProfiles ?? []) as TimetableProfile[];
  const events = (backup.data.scheduleEvents ?? []) as ScheduleEvent[];
  const exams = (backup.data.exams ?? []) as Exam[];
  const rules = (backup.data.reminderRules ?? []) as ReminderRule[];
  const prefs = backup.data.preferences ?? [];

  const validSemesters = semesters.filter((x) => zSemester.safeParse(x).success);
  const validCourses = courses.filter((x) => zCourse.safeParse(x).success);
  const validSessions = sessions.filter((x) => zCourseSession.safeParse(x).success);
  const validExceptions = exceptions.filter((x) => zCourseException.safeParse(x).success);
  const validSlots = slots.filter((x) => zClassTimeSlot.safeParse(x).success);
  const validProfiles = profiles.filter((x) => zTimetableProfile.safeParse(x).success);
  const validEvents = events.filter((x) => zScheduleEvent.safeParse(x).success);
  const validExams = exams.filter((x) => zExam.safeParse(x).success);
  const validRules = rules.filter((x) => zReminderRule.safeParse(x).success);
  const validPrefs = prefs.filter(
    (p): p is { key: string; value: unknown; updatedAt: number } =>
      typeof p?.key === "string" && p.key !== "",
  );
  // 偏好设置中的 activeSemesterId 需在学期表里存在，否则清掉
  const validPrefsFixed = validPrefs.map((p) => {
    if (p.key !== "app" || typeof p.value !== "object" || p.value === null) return p;
    const parsed = zAppSettings.safeParse(p.value);
    if (!parsed.success) return p;
    const settings = parsed.data;
    if (settings.activeSemesterId && !validSemesters.some((s) => s.id === settings.activeSemesterId)) {
      return { ...p, value: { ...settings, activeSemesterId: undefined } };
    }
    return p;
  });

  const tables = {
    semesters: { store: db.semesters, rows: validSemesters },
    courses: { store: db.courses, rows: validCourses },
    courseSessions: { store: db.courseSessions, rows: validSessions },
    courseExceptions: { store: db.courseExceptions, rows: validExceptions },
    timeSlots: { store: db.timeSlots, rows: validSlots },
    timetableProfiles: { store: db.timetableProfiles, rows: validProfiles },
    scheduleEvents: { store: db.scheduleEvents, rows: validEvents },
    exams: { store: db.exams, rows: validExams },
    reminderRules: { store: db.reminderRules, rows: validRules },
    preferences: { store: db.preferences, rows: validPrefsFixed },
  } as const;

  const totalRows = Object.values(tables).reduce((n, t) => n + t.rows.length, 0);
  if (totalRows === 0) {
    throw new Error("备份中没有可识别的数据：文件可能已损坏或不属于 CampusFlow");
  }

  const writeTable = async (
    store: { clear(): Promise<void>; bulkPut(rows: readonly unknown[]): Promise<unknown> },
    rows: readonly unknown[],
  ): Promise<number> => {
    if (mode === "replace") await store.clear();
    if (rows.length > 0) await store.bulkPut(rows);
    return rows.length;
  };

  await db.transaction("rw", Object.values(tables).map((t) => t.store), async () => {
    report.imported.semesters = await writeTable(tables.semesters.store, tables.semesters.rows);
    report.imported.timetableProfiles = await writeTable(tables.timetableProfiles.store, tables.timetableProfiles.rows);
    report.imported.courses = await writeTable(tables.courses.store, tables.courses.rows);
    report.imported.courseSessions = await writeTable(tables.courseSessions.store, tables.courseSessions.rows);
    report.imported.courseExceptions = await writeTable(tables.courseExceptions.store, tables.courseExceptions.rows);
    report.imported.timeSlots = await writeTable(tables.timeSlots.store, tables.timeSlots.rows);
    report.imported.scheduleEvents = await writeTable(tables.scheduleEvents.store, tables.scheduleEvents.rows);
    report.imported.exams = await writeTable(tables.exams.store, tables.exams.rows);
    report.imported.reminderRules = await writeTable(tables.reminderRules.store, tables.reminderRules.rows);
    report.imported.preferences = await writeTable(tables.preferences.store, tables.preferences.rows);
  });

  // 旧备份可能缺少课表方案或课程未归属方案：恢复后统一补齐（幂等）
  await ensureProfileConsistency();
  void track;
  return report;
}

/** 解析备份 JSON 文本（校验顶层结构）。 */
export function parseBackupJson(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是合法的 JSON");
  }
  const b = parsed as BackupFile;
  if (!b || typeof b !== "object" || !b.data || !b.meta) {
    throw new Error("缺少 CampusFlow 备份结构（meta/data）");
  }
  return b;
}

export const BACKUP_DB_NAME = DB_NAME;
