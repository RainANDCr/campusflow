import {
  createId,
  zScheduleEvent,
  type EventCategory,
  type EventRepeat,
  type ScheduleEvent,
  type TaskPriority,
} from "@/core/models";
import { db } from "./dexie";

function nowMs() {
  return Date.now();
}

export interface EventInput {
  title: string;
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  category: EventCategory;
  courseId?: string;
  note?: string;
  repeat?: EventRepeat;
  priority?: TaskPriority;
}

function emptyOrTrim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

export async function createEvent(
  semesterId: string | undefined,
  input: EventInput,
): Promise<ScheduleEvent> {
  const candidate: ScheduleEvent = {
    id: createId(),
    semesterId: semesterId || undefined,
    courseId: input.courseId || undefined,
    title: input.title.trim(),
    date: input.date,
    allDay: input.allDay,
    startTime: input.allDay ? undefined : input.startTime,
    endTime: input.allDay ? undefined : (input.endTime || undefined),
    category: input.category,
    note: emptyOrTrim(input.note),
    done: false,
    repeat: input.repeat && input.repeat !== "none" ? input.repeat : undefined,
    priority: input.priority,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zScheduleEvent.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "日程数据不合法");
  }
  await db.scheduleEvents.add(parsed.data);
  return parsed.data;
}

export async function updateEvent(
  id: string,
  input: EventInput,
): Promise<void> {
  const existing = await db.scheduleEvents.get(id);
  if (!existing) throw new Error("日程不存在或已被删除");
  const candidate: ScheduleEvent = {
    ...existing,
    courseId: input.courseId || undefined,
    title: input.title.trim(),
    date: input.date,
    allDay: input.allDay,
    startTime: input.allDay ? undefined : input.startTime,
    endTime: input.allDay ? undefined : (input.endTime || undefined),
    category: input.category,
    note: emptyOrTrim(input.note),
    repeat: input.repeat && input.repeat !== "none" ? input.repeat : undefined,
    priority: input.priority,
    updatedAt: nowMs(),
  };
  const parsed = zScheduleEvent.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "日程数据不合法");
  }
  await db.scheduleEvents.put(parsed.data);
}

/** 切换待办完成状态。 */
export async function setEventDone(id: string, done: boolean): Promise<void> {
  const existing = await db.scheduleEvents.get(id);
  if (!existing) return;
  await db.scheduleEvents.put({ ...existing, done, updatedAt: nowMs() });
}

export async function deleteEvent(id: string): Promise<void> {
  await db.scheduleEvents.delete(id);
}
