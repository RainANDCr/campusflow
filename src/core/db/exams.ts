import { createId, zExam, type Exam, type ExamKind } from "@/core/models";
import { db } from "./dexie";

function nowMs() {
  return Date.now();
}

function emptyOrTrim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

export interface ExamInput {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  courseId?: string;
  building?: string;
  room?: string;
  seat?: string;
  kind?: ExamKind;
  priority?: "high" | "normal";
  note?: string;
}

function build(semesterId: string, input: ExamInput, existing?: Exam): Exam {
  const candidate: Exam = {
    id: existing?.id ?? createId(),
    semesterId,
    courseId: input.courseId || undefined,
    name: input.name.trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    building: emptyOrTrim(input.building),
    room: emptyOrTrim(input.room),
    seat: emptyOrTrim(input.seat),
    kind: input.kind,
    priority: input.priority,
    note: emptyOrTrim(input.note),
    createdAt: existing?.createdAt ?? nowMs(),
    updatedAt: nowMs(),
  };
  const parsed = zExam.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "考试信息不合法");
  }
  return parsed.data;
}

export async function createExam(semesterId: string, input: ExamInput): Promise<Exam> {
  const exam = build(semesterId, input);
  await db.exams.add(exam);
  return exam;
}

export async function updateExam(id: string, input: ExamInput): Promise<void> {
  const existing = await db.exams.get(id);
  if (!existing) throw new Error("考试不存在或已被删除");
  await db.exams.put(build(existing.semesterId, input, existing));
}

export async function deleteExam(id: string): Promise<void> {
  await db.exams.delete(id);
}
