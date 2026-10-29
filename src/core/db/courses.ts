import {
  createId,
  zCourse,
  zCourseSession,
  type Course,
  type CourseSession,
  type WeekRule,
} from "@/core/models";
import { db, type CampusFlowDB } from "./dexie";

export interface SessionInput {
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
  weekRule: WeekRule;
  teacher?: string;
  building?: string;
  room?: string;
  note?: string;
}

export interface CourseInput {
  name: string;
  teacher?: string;
  building?: string;
  room?: string;
  type: Course["type"];
  color: string;
  icon?: string;
  note?: string;
  tags?: string[];
  classGroup?: string;
  /** 课表方案归属；缺省时自动归入学期主方案 */
  profileId?: string;
  sessions: SessionInput[];
}

function nowMs() {
  return Date.now();
}

function emptyOrTrim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function buildSessions(
  courseId: string,
  semesterId: string,
  inputs: SessionInput[],
  existing?: CourseSession[],
): CourseSession[] {
  return inputs.map((input, i) => {
    const old = existing?.[i];
    const candidate: CourseSession = {
      id: old && old.courseId === courseId ? old.id : createId(),
      courseId,
      semesterId,
      dayOfWeek: input.dayOfWeek,
      startSlot: input.startSlot,
      endSlot: input.endSlot,
      weekRule: input.weekRule,
      teacher: emptyOrTrim(input.teacher),
      building: emptyOrTrim(input.building),
      room: emptyOrTrim(input.room),
      note: emptyOrTrim(input.note),
      createdAt: old?.createdAt ?? nowMs(),
      updatedAt: nowMs(),
    };
    const parsed = zCourseSession.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "上课安排数据不合法",
      );
    }
    return parsed.data;
  });
}

/** 新建课程（含上课安排），整体校验后事务写入。 */
export async function createCourse(
  semesterId: string,
  input: CourseInput,
): Promise<Course> {
  if (input.sessions.length === 0) {
    throw new Error("至少需要一个上课时间");
  }
  let profileId = input.profileId;
  if (profileId) {
    const profile = await db.timetableProfiles.get(profileId);
    if (!profile || profile.semesterId !== semesterId) {
      throw new Error("课表方案不存在或不属于当前学期");
    }
  } else {
    const { getPrimaryProfile } = await import("./profiles");
    const primary = await getPrimaryProfile(semesterId);
    if (!primary) {
      // 兼容直接创建课程的旧路径：先补齐方案
      const { ensureProfileConsistency } = await import("./profiles");
      await ensureProfileConsistency();
      const retry = await getPrimaryProfile(semesterId);
      if (!retry) throw new Error("学期缺少课表方案，请先创建学期");
      profileId = retry.id;
    } else {
      profileId = primary.id;
    }
  }
  const maxOrder = await db.courses
    .where("semesterId")
    .equals(semesterId)
    .toArray()
    .then((list) => Math.max(-1, ...list.map((c) => c.order)));
  const course: Course = {
    id: createId(),
    semesterId,
    name: input.name.trim(),
    teacher: emptyOrTrim(input.teacher),
    building: emptyOrTrim(input.building),
    room: emptyOrTrim(input.room),
    type: input.type,
    color: input.color,
    icon: emptyOrTrim(input.icon),
    note: emptyOrTrim(input.note),
    tags: input.tags && input.tags.length > 0 ? input.tags.map((t) => t.trim()).filter(Boolean) : undefined,
    classGroup: emptyOrTrim(input.classGroup),
    profileId,
    order: maxOrder + 1,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  const parsedCourse = zCourse.safeParse(course);
  if (!parsedCourse.success) {
    throw new Error(parsedCourse.error.issues[0]?.message ?? "课程数据不合法");
  }
  const sessions = buildSessions(parsedCourse.data.id, semesterId, input.sessions);
  await db.transaction("rw", [db.courses, db.courseSessions], async () => {
    await db.courses.add(parsedCourse.data);
    await db.courseSessions.bulkAdd(sessions);
  });
  return parsedCourse.data;
}

/** 更新课程：整体替换上课安排（保留未变化的安排 ID 以便调课记录追溯）。 */
export async function updateCourse(
  courseId: string,
  input: CourseInput,
): Promise<void> {
  const existing = await db.courses.get(courseId);
  if (!existing) throw new Error("课程不存在或已被删除");
  if (input.sessions.length === 0) {
    throw new Error("至少需要一个上课时间");
  }
  const oldSessions = await db.courseSessions
    .where("courseId")
    .equals(courseId)
    .toArray();
  const course: Course = {
    ...existing,
    name: input.name.trim(),
    teacher: emptyOrTrim(input.teacher),
    building: emptyOrTrim(input.building),
    room: emptyOrTrim(input.room),
    type: input.type,
    color: input.color,
    icon: emptyOrTrim(input.icon),
    note: emptyOrTrim(input.note),
    tags: input.tags && input.tags.length > 0 ? input.tags.map((t) => t.trim()).filter(Boolean) : undefined,
    classGroup: emptyOrTrim(input.classGroup),
    updatedAt: nowMs(),
  };
  const parsedCourse = zCourse.safeParse(course);
  if (!parsedCourse.success) {
    throw new Error(parsedCourse.error.issues[0]?.message ?? "课程数据不合法");
  }
  const sessions = buildSessions(
    courseId,
    existing.semesterId,
    input.sessions,
    oldSessions,
  );
  await db.transaction("rw", [db.courses, db.courseSessions], async () => {
    await db.courses.put(parsedCourse.data);
    await db.courseSessions.where("courseId").equals(courseId).delete();
    await db.courseSessions.bulkPut(sessions);
  });
}

/** 课程删除快照：恢复删除前的完整数据（含上课安排）。 */
export interface CourseSnapshot {
  course: Course;
  sessions: CourseSession[];
}

/** 删除课程及其全部上课安排。返回删除前快照，用于撤销恢复。 */
export async function deleteCourse(
  courseId: string,
  target: CampusFlowDB = db,
): Promise<CourseSnapshot | null> {
  const course = await target.courses.get(courseId);
  if (!course) return null;
  const sessions = await target.courseSessions
    .where("courseId")
    .equals(courseId)
    .toArray();
  await target.transaction("rw", [target.courses, target.courseSessions], async () => {
    await target.courses.delete(courseId);
    await target.courseSessions.where("courseId").equals(courseId).delete();
  });
  return { course, sessions };
}

/** 恢复课程删除快照（撤销）。 */
export async function restoreCourseSnapshot(
  snapshot: CourseSnapshot,
  target: CampusFlowDB = db,
): Promise<void> {
  await target.transaction("rw", [target.courses, target.courseSessions], async () => {
    await target.courses.put(snapshot.course);
    await target.courseSessions.bulkPut(snapshot.sessions);
  });
}

/** 批量删除课程（单事务），返回全部快照供撤销。 */
export async function deleteCoursesBatch(
  courseIds: string[],
  target: CampusFlowDB = db,
): Promise<CourseSnapshot[]> {
  const snapshots: CourseSnapshot[] = [];
  await target.transaction("rw", [target.courses, target.courseSessions], async () => {
    for (const id of courseIds) {
      const course = await target.courses.get(id);
      if (!course) continue;
      const sessions = await target.courseSessions.where("courseId").equals(id).toArray();
      snapshots.push({ course, sessions });
      await target.courses.delete(id);
      await target.courseSessions.where("courseId").equals(id).delete();
    }
  });
  return snapshots;
}

/** 复制课程（名称加“（副本）”，含全部上课安排）。返回新课程 ID。 */
export async function duplicateCourse(courseId: string): Promise<string> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error("课程不存在或已被删除");
  const sessions = await db.courseSessions
    .where("courseId")
    .equals(courseId)
    .toArray();
  const newId = createId();
  const copy: Course = {
    ...course,
    id: newId,
    name: `${course.name}（副本）`,
    order: course.order + 1,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  const sessionCopies = sessions.map((s) => ({
    ...s,
    id: createId(),
    courseId: newId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  }));
  await db.transaction("rw", [db.courses, db.courseSessions], async () => {
    await db.courses.add(copy);
    await db.courseSessions.bulkAdd(sessionCopies);
  });
  return newId;
}
