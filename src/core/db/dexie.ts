import Dexie, { type Table } from "dexie";
import { createId } from "@/core/models";
import type {
  Course,
  CourseException,
  CourseSession,
  ClassTimeSlot,
  Exam,
  PreferenceRecord,
  ReminderRule,
  ScheduleEvent,
  Semester,
  TimetableProfile,
} from "@/core/models";

/** 当前数据库 schema 版本。每次结构性变更必须递增并编写升级逻辑。 */
export const DB_SCHEMA_VERSION = 2;

export const DB_NAME = "campusflow";

/** v1 与 v2 共用的索引声明（v2 仅新增表，不修改既有索引）。 */
const SHARED_STORES = {
  semesters: "id, status, startDate",
  courses: "id, semesterId, [semesterId+order]",
  courseSessions: "id, courseId, semesterId, [semesterId+dayOfWeek]",
  courseExceptions: "id, semesterId, courseId, kind, originalDate, date",
  timeSlots: "id, semesterId, [semesterId+index]",
  scheduleEvents: "id, semesterId, date",
  exams: "id, semesterId, date",
  reminderRules: "id, scope, courseId",
  preferences: "key",
} as const;

/**
 * CampusFlow 本地数据库（IndexedDB，经 Dexie 访问）。
 *
 * 设计约定：
 * - 所有实体主键为 id（uuid）；学期内数据冗余存储 semesterId 便于按学期查询。
 * - 升级策略：新增表/索引 → 追加 version(n)；数据形状变化 → 在 version(n).upgrade() 中迁移，绝不静默丢数据。
 * - v2：新增 timetableProfiles（多套课表方案）；迁移为每个存量学期创建“主课表”方案并回填课程的 profileId。
 *   旧版字段全部保留，旧备份可继续导入（导入后由 ensureProfileConsistency 补齐方案归属）。
 */
export class CampusFlowDB extends Dexie {
  semesters!: Table<Semester, string>;
  courses!: Table<Course, string>;
  courseSessions!: Table<CourseSession, string>;
  courseExceptions!: Table<CourseException, string>;
  timeSlots!: Table<ClassTimeSlot, string>;
  scheduleEvents!: Table<ScheduleEvent, string>;
  exams!: Table<Exam, string>;
  reminderRules!: Table<ReminderRule, string>;
  preferences!: Table<PreferenceRecord, string>;
  timetableProfiles!: Table<TimetableProfile, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SHARED_STORES);
    this.version(2)
      .stores({
        ...SHARED_STORES,
        timetableProfiles: "id, semesterId, [semesterId+isPrimary]",
      })
      .upgrade(async (tx) => {
        const profilesTable = tx.table("timetableProfiles");
        const coursesTable = tx.table("courses");
        const semesters = await tx.table("semesters").toArray();
        const now = Date.now();
        for (const sem of semesters) {
          const profileId = createId();
          await profilesTable.add({
            id: profileId,
            semesterId: sem.id,
            name: "主课表",
            isPrimary: 1,
            order: 0,
            createdAt: now,
            updatedAt: now,
          });
          await coursesTable
            .where("semesterId")
            .equals(sem.id)
            .modify((course: Record<string, unknown>) => {
              course.profileId = profileId;
            });
        }
      });
  }
}

// HMR 防护：Vite 开发期模块重载会用新实例重新打开同名库，
// 多实例并发触发 Dexie 版本协商混乱（verno 膨胀甚至丢数据）。
// 将单例缓存到 globalThis，HMR 重执行时复用同一连接；生产构建无影响。
const globalRef = globalThis as unknown as { __campusflowDB?: CampusFlowDB };
export const db: CampusFlowDB = (globalRef.__campusflowDB ??= new CampusFlowDB());
