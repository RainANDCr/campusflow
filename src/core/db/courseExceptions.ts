import {
  createId,
  zCourseException,
  type CourseException,
} from "@/core/models";
import { db } from "./dexie";

/** 分布式 Omit：对联合类型的每个成员分别剔除字段（普通 Omit 只保留公共键）。 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

/** 新建/编辑例外的输入形状（按 kind 区分）。 */
export type ExceptionInput = DistributiveOmit<
  CourseException,
  "id" | "createdAt" | "updatedAt"
>;

function nowMs() {
  return Date.now();
}

/** 新增例外（停课/调课/补课）。数据经 Zod 校验，不合法直接抛错。 */
export async function createException(
  input: ExceptionInput,
): Promise<CourseException> {
  const candidate = {
    ...input,
    id: createId(),
    createdAt: nowMs(),
    updatedAt: nowMs(),
  } as CourseException;
  const parsed = zCourseException.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "变更数据不合法");
  }
  await db.courseExceptions.add(parsed.data);
  return parsed.data;
}

/** 编辑例外记录（整体替换，保持 id 不变以便追溯）。 */
export async function updateException(
  id: string,
  input: ExceptionInput,
): Promise<void> {
  const existing = await db.courseExceptions.get(id);
  if (!existing) throw new Error("变更记录不存在或已被删除");
  const candidate = { ...input, id, createdAt: existing.createdAt, updatedAt: nowMs() } as CourseException;
  const parsed = zCourseException.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "变更数据不合法");
  }
  await db.courseExceptions.put(parsed.data);
}

/** 删除例外（即撤销该次调课/停课/补课，课表恢复原状）。 */
export async function deleteException(id: string): Promise<void> {
  await db.courseExceptions.delete(id);
}

/** 某学期的全部例外，按相关日期倒序（最近的在前）。 */
export async function listExceptions(semesterId: string): Promise<CourseException[]> {
  const list = await db.courseExceptions
    .where("semesterId")
    .equals(semesterId)
    .toArray();
  return list.sort((a, b) => {
    const dateA = a.kind === "extra" ? a.date : a.originalDate;
    const dateB = b.kind === "extra" ? b.date : b.originalDate;
    return dateB.localeCompare(dateA);
  });
}
