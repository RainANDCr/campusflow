import {
  createId,
  zSemester,
  type ClassTimeSlot,
  type Course,
  type CourseException,
  type CourseSession,
  type ISODate,
  type Semester,
  type TimetableProfile,
  type WeekStartsOn,
} from "@/core/models";
import { computeWeekOneAnchor } from "@/core/services/weekCalc";
import { isValidISODate } from "@/lib/date";
import { db } from "./dexie";

export interface SemesterInput {
  name: string;
  startDate: ISODate;
  /** 第一周锚点；不传则按开学日期自动推算 */
  weekOneAnchor?: ISODate;
  totalWeeks: number;
  weekStartsOn: WeekStartsOn;
  /** 特殊教学周标注（考试周/实训周/假期周等） */
  specialWeeks?: Semester["specialWeeks"];
}

function nowMs() {
  return Date.now();
}

function buildSemester(input: SemesterInput, existing?: Semester): Semester {
  const candidate: Semester = {
    id: existing?.id ?? createId(),
    name: input.name,
    startDate: input.startDate,
    weekOneAnchor: input.weekOneAnchor ?? computeWeekOneAnchor(input.startDate, input.weekStartsOn),
    totalWeeks: input.totalWeeks,
    weekStartsOn: input.weekStartsOn,
    status: existing?.status ?? "current",
    specialWeeks:
      input.specialWeeks && input.specialWeeks.length > 0 ? input.specialWeeks : undefined,
    createdAt: existing?.createdAt ?? nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zSemester.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "学期数据不合法");
  }
  return parsed.data;
}

/** 创建学期，返回新学期。 */
export async function createSemester(input: SemesterInput): Promise<Semester> {
  const semester = buildSemester(input);
  await db.semesters.add(semester);
  return semester;
}

/** 更新学期基础信息（不改状态）。 */
export async function updateSemester(id: string, input: SemesterInput): Promise<void> {
  const existing = await db.semesters.get(id);
  if (!existing) throw new Error("学期不存在或已被删除");
  const semester = buildSemester(input, existing);
  await db.semesters.put(semester);
}

export async function setSemesterArchived(id: string, archived: boolean): Promise<void> {
  const existing = await db.semesters.get(id);
  if (!existing) throw new Error("学期不存在或已被删除");
  await db.semesters.put({
    ...existing,
    status: archived ? "archived" : "current",
    updatedAt: nowMs(),
  });
}

/** 学期删除快照：级联删除前的全部从属数据。 */
export interface SemesterSnapshot {
  semester: Semester;
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  slots: ClassTimeSlot[];
  profiles: TimetableProfile[];
}

/**
 * 删除学期及其全部从属数据（课程、上课安排、调课记录、节次配置、课表方案）。
 * 返回删除前快照用于撤销恢复。
 */
export async function deleteSemesterCascade(id: string): Promise<SemesterSnapshot | null> {
  const semester = await db.semesters.get(id);
  if (!semester) return null;
  const [courses, sessions, exceptions, slots, profiles] = await Promise.all([
    db.courses.where("semesterId").equals(id).toArray(),
    db.courseSessions.where("semesterId").equals(id).toArray(),
    db.courseExceptions.where("semesterId").equals(id).toArray(),
    db.timeSlots.where("semesterId").equals(id).toArray(),
    db.timetableProfiles.where("semesterId").equals(id).toArray(),
  ]);
  await db.transaction(
    "rw",
    [db.semesters, db.courses, db.courseSessions, db.courseExceptions, db.timeSlots, db.timetableProfiles],
    async () => {
      const courseIds = new Set(courses.map((c) => c.id));
      await db.courses.where("semesterId").equals(id).delete();
      await db.courseSessions.where("semesterId").equals(id).delete();
      await db.courseExceptions.where("semesterId").equals(id).delete();
      await db.timeSlots.where("semesterId").equals(id).delete();
      await db.timetableProfiles.where("semesterId").equals(id).delete();
      // 兜底清理可能存在的孤儿数据（正常不会命中）
      for (const cid of courseIds) {
        await db.courseSessions.where("courseId").equals(cid).delete();
      }
      await db.semesters.delete(id);
    },
  );
  return { semester, courses, sessions, exceptions, slots, profiles };
}

/** 恢复学期删除快照（撤销）。 */
export async function restoreSemesterSnapshot(snapshot: SemesterSnapshot): Promise<void> {
  await db.transaction(
    "rw",
    [db.semesters, db.courses, db.courseSessions, db.courseExceptions, db.timeSlots, db.timetableProfiles],
    async () => {
      await db.semesters.put(snapshot.semester);
      await db.courses.bulkPut(snapshot.courses);
      await db.courseSessions.bulkPut(snapshot.sessions);
      await db.courseExceptions.bulkPut(snapshot.exceptions);
      await db.timeSlots.bulkPut(snapshot.slots);
      await db.timetableProfiles.bulkPut(snapshot.profiles);
    },
  );
}

/** 校验日期输入（表单层使用）。 */
export function assertValidDate(value: string, field: string): ISODate {
  if (!isValidISODate(value)) throw new Error(`${field}格式不正确`);
  return value;
}
