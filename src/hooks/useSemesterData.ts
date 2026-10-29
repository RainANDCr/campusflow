import { useLiveQuery } from "dexie-react-hooks";
import type {
  ClassTimeSlot,
  Course,
  CourseException,
  CourseSession,
  Semester,
  TimetableProfile,
} from "@/core/models";
import { db } from "@/core/db/dexie";
import { coursesForProfile, selectActiveProfile } from "@/core/db/profiles";
import { useSettingsStore } from "@/stores/settingsStore";

export interface SemesterData {
  semester: Semester | undefined;
  slots: ClassTimeSlot[];
  /** 激活方案下的课程 */
  courses: Course[];
  /** 激活方案下的上课安排 */
  sessions: CourseSession[];
  /** 调课/停课/补课记录 */
  exceptions: CourseException[];
  /** 学期全部课表方案 */
  profiles: TimetableProfile[];
  /** 当前激活方案 */
  activeProfile: TimetableProfile | undefined;
  /** 数据是否仍在加载 */
  loading: boolean;
  /** 数据库中是否存在学期 */
  hasAnySemester: boolean;
}

/**
 * 当前激活学期的完整课表数据。
 * 激活学期 = 设置中的 activeSemesterId；未设置时回退到最新的进行中学期。
 * 课程按激活课表方案（TimetableProfile）过滤，实现一学期多套课表。
 */
export function useSemesterData(): SemesterData {
  const activeId = useSettingsStore((s) => s.settings.activeSemesterId);
  const activeProfileId = useSettingsStore((s) => s.settings.activeProfileId);

  const semesters = useLiveQuery(() => db.semesters.toArray(), []);
  const semesterId =
    semesters === undefined
      ? undefined
      : (semesters.find((s) => s.id === activeId) ??
          semesters
            .filter((s) => s.status === "current")
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
        )?.id;

  const slots = useLiveQuery(
    () =>
      semesterId
        ? db.timeSlots
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) => list.sort((a, b) => a.index - b.index))
        : Promise.resolve([] as ClassTimeSlot[]),
    [semesterId],
  );
  const allCourses = useLiveQuery(
    () =>
      semesterId
        ? db.courses
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) => list.sort((a, b) => a.order - b.order))
        : Promise.resolve([] as Course[]),
    [semesterId],
  );
  const allSessions = useLiveQuery(
    () =>
      semesterId
        ? db.courseSessions.where("semesterId").equals(semesterId).toArray()
        : Promise.resolve([] as CourseSession[]),
    [semesterId],
  );
  const exceptions = useLiveQuery(
    () =>
      semesterId
        ? db.courseExceptions.where("semesterId").equals(semesterId).toArray()
        : Promise.resolve([] as CourseException[]),
    [semesterId],
  );
  const profiles = useLiveQuery(
    () =>
      semesterId
        ? db.timetableProfiles
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) =>
              list.sort((a, b) => b.isPrimary - a.isPrimary || a.order - b.order),
            )
        : Promise.resolve([] as TimetableProfile[]),
    [semesterId],
  );

  const activeProfile = selectActiveProfile(profiles ?? [], activeProfileId);
  const courses = coursesForProfile(allCourses ?? [], activeProfile);
  const courseIds = new Set(courses.map((c) => c.id));
  const sessions = (allSessions ?? []).filter((s) => courseIds.has(s.courseId));

  return {
    semester: semesters?.find((s) => s.id === semesterId),
    slots: slots ?? [],
    courses,
    sessions,
    exceptions: exceptions ?? [],
    profiles: profiles ?? [],
    activeProfile,
    loading:
      semesters === undefined ||
      slots === undefined ||
      allCourses === undefined ||
      allSessions === undefined ||
      exceptions === undefined ||
      profiles === undefined,
    hasAnySemester: (semesters?.length ?? 0) > 0,
  };
}
