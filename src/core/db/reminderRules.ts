import {
  createId,
  PREF_KEY_SETTINGS,
  zReminderRule,
  type ReminderRule,
} from "@/core/models";
import { db } from "./dexie";

function nowMs() {
  return Date.now();
}

/** 全局上课提醒规则（单条，scope=global & kind=class）。 */
export async function getGlobalClassReminder(): Promise<ReminderRule | undefined> {
  const all = await db.reminderRules
    .where("scope")
    .equals("global")
    .toArray();
  return all.find((r) => r.kind === "class");
}

/** 设置全局上课提醒（minutesBefore 传 null 表示关闭）。 */
export async function setGlobalClassReminder(minutesBefore: number | null): Promise<void> {
  const existing = await getGlobalClassReminder();
  if (minutesBefore === null) {
    if (existing) await db.reminderRules.delete(existing.id);
    return;
  }
  const rule: ReminderRule = {
    id: existing?.id ?? createId(),
    scope: "global",
    kind: "class",
    minutesBefore,
    enabled: true,
    createdAt: existing?.createdAt ?? nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zReminderRule.safeParse(rule);
  if (!parsed.success) throw new Error("提醒设置不合法");
  await db.reminderRules.put(parsed.data);
}

/** 某门课程的提醒覆盖（未设置返回 undefined = 跟随全局）。 */
export async function getCourseReminder(
  courseId: string,
): Promise<ReminderRule | undefined> {
  const all = await db.reminderRules.where("courseId").equals(courseId).toArray();
  return all.find((r) => r.kind === "class" && r.scope === "course");
}

/**
 * 设置课程级提醒覆盖。
 * choice: "global" 跟随全局（删除覆盖）；"off" 关闭；数字为提前分钟数。
 */
export async function setCourseReminder(
  courseId: string,
  choice: "global" | "off" | number,
): Promise<void> {
  const existing = await getCourseReminder(courseId);
  if (choice === "global") {
    if (existing) await db.reminderRules.delete(existing.id);
    return;
  }
  const rule: ReminderRule = {
    id: existing?.id ?? createId(),
    scope: "course",
    kind: "class",
    courseId,
    minutesBefore: choice === "off" ? 1 : choice,
    enabled: choice !== "off",
    createdAt: existing?.createdAt ?? nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zReminderRule.safeParse(rule);
  if (!parsed.success) throw new Error("提醒设置不合法");
  await db.reminderRules.put(parsed.data);
}

/** 解析某门课的生效提醒分钟数；null = 不提醒。 */
export function resolveCourseMinutes(
  globalRule: ReminderRule | undefined,
  courseRule: ReminderRule | undefined,
): number | null {
  if (courseRule) return courseRule.enabled ? courseRule.minutesBefore : null;
  if (globalRule) return globalRule.enabled ? globalRule.minutesBefore : null;
  return null;
}

/** 备份时顺带导出的键（供导入功能判断归属）。 */
export const REMINDER_PREF_KEY = PREF_KEY_SETTINGS;
