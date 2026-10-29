import {
  createId,
  zTimetableProfile,
  type TimetableProfile,
} from "@/core/models";
import { db, type CampusFlowDB } from "./dexie";

function nowMs() {
  return Date.now();
}

/** 某学期的全部课表方案（主方案在前，其余按 order）。 */
export async function listProfiles(semesterId: string): Promise<TimetableProfile[]> {
  const list = await db.timetableProfiles
    .where("semesterId")
    .equals(semesterId)
    .toArray();
  return list.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return b.isPrimary - a.isPrimary;
    return a.order - b.order || a.createdAt - b.createdAt;
  });
}

export async function getPrimaryProfile(
  semesterId: string,
): Promise<TimetableProfile | undefined> {
  const list = await db.timetableProfiles
    .where("[semesterId+isPrimary]")
    .equals([semesterId, 1])
    .toArray();
  return list.sort((a, b) => a.order - b.order)[0];
}

/** 创建课表方案。 */
export async function createProfile(
  semesterId: string,
  input: { name: string; isPrimary?: boolean },
): Promise<TimetableProfile> {
  const maxOrder = await db.timetableProfiles
    .where("semesterId")
    .equals(semesterId)
    .toArray()
    .then((list) => Math.max(-1, ...list.map((p) => p.order)));
  const candidate: TimetableProfile = {
    id: createId(),
    semesterId,
    name: input.name,
    isPrimary: input.isPrimary ? 1 : 0,
    order: maxOrder + 1,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zTimetableProfile.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "课表方案数据不合法");
  }
  await db.timetableProfiles.add(parsed.data);
  return parsed.data;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<TimetableProfile, "name" | "isPrimary" | "order">>,
): Promise<void> {
  const existing = await db.timetableProfiles.get(id);
  if (!existing) throw new Error("课表方案不存在或已被删除");
  await db.timetableProfiles.put({
    ...existing,
    ...patch,
    updatedAt: nowMs(),
  });
}

/** 删除方案（主方案需先把其他方案设为主，或随学期级联删除）。 */
export async function deleteProfile(id: string): Promise<void> {
  const existing = await db.timetableProfiles.get(id);
  if (!existing) return;
  if (existing.isPrimary === 1) {
    const siblings = await db.timetableProfiles
      .where("semesterId")
      .equals(existing.semesterId)
      .toArray();
    if (siblings.length > 1) {
      throw new Error("主课表方案不能直接删除：请先把其他方案设为主课表");
    }
  }
  // 方案内课程回到无主状态，由 ensureProfileConsistency 归入剩余主方案
  await db.transaction("rw", [db.timetableProfiles, db.courses], async () => {
    await db.timetableProfiles.delete(id);
    await db.courses
      .where("profileId")
      .equals(id)
      .modify((course: Record<string, unknown>) => {
        delete course.profileId;
      });
  });
}

/** 选择激活方案：优先用户选择 → 主方案 → 第一个。 */
export function selectActiveProfile(
  profiles: TimetableProfile[],
  preferredId?: string,
): TimetableProfile | undefined {
  if (preferredId) {
    const chosen = profiles.find((p) => p.id === preferredId);
    if (chosen) return chosen;
  }
  return profiles.find((p) => p.isPrimary === 1) ?? profiles[0];
}

/** 取某方案下的课程；兼容旧数据：未归属方案（无 profileId）的课程在主方案下可见。 */
export function coursesForProfile<T extends { profileId?: string }>(
  courses: T[],
  activeProfile: { id: string; isPrimary: 0 | 1 } | undefined,
): T[] {
  if (!activeProfile) return courses;
  return courses.filter(
    (c) => c.profileId === activeProfile.id || (!c.profileId && activeProfile.isPrimary === 1),
  );
}

/** 确保每个学期至少有一个主方案，且所有课程都归属到本学期的某个方案。幂等。 */
export async function ensureProfileConsistency(target: CampusFlowDB = db): Promise<void> {
  const semesters = await target.semesters.toArray();
  const now = Date.now();
  for (const sem of semesters) {
    const profiles = await target.timetableProfiles
      .where("semesterId")
      .equals(sem.id)
      .toArray();
    let primary =
      profiles.find((p) => p.isPrimary === 1) ??
      profiles.sort((a, b) => a.order - b.order)[0];
    if (primary && primary.isPrimary !== 1) {
      primary = { ...primary, isPrimary: 1 };
      await target.timetableProfiles.put(primary);
    }
    if (!primary) {
      primary = {
        id: createId(),
        semesterId: sem.id,
        name: "主课表",
        isPrimary: 1,
        order: 0,
        createdAt: now,
        updatedAt: now,
      };
      await target.timetableProfiles.add(primary);
    }
    const orphans = (await target.courses.where("semesterId").equals(sem.id).toArray()).filter(
      (c) => !c.profileId,
    );
    if (orphans.length > 0) {
      await target.courses.bulkPut(
        orphans.map((c) => ({ ...c, profileId: primary.id, updatedAt: now })),
      );
    }
  }
}
