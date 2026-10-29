import type { Exam, ReminderRule, ScheduleEvent } from "@/core/models";
import type { QuietHours } from "@/core/models";
import type { CourseInstance } from "./schedule";

/** 待触发的本地提醒。id 稳定可去重（重复调度会先取消旧任务）。 */
export interface PendingNotification {
  id: string;
  title: string;
  body: string;
  fireAt: number;
}

const MAX_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

function minutesOf(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/**
 * 静音时段处理（模块 05 #16）：落点在静音窗口内的提醒顺延到窗口结束。
 * 支持 × 跨午夜窗口（如 23:00-07:00）。
 */
export function shiftOutOfQuietHours(fireAt: number, quiet: QuietHours): number {
  if (!quiet.enabled) return fireAt;
  const startM = minutesOf(quiet.start);
  const endM = minutesOf(quiet.end);
  if (startM === endM) return fireAt;
  const d = new Date(fireAt);
  const curM = d.getHours() * 60 + d.getMinutes();
  const inQuiet =
    startM < endM
      ? curM >= startM && curM < endM
      : curM >= startM || curM < endM;
  if (!inQuiet) return fireAt;
  // 顺延到本日（或次日）的静音结束时刻
  const shifted = new Date(fireAt);
  shifted.setHours(Math.floor(endM / 60), endM % 60, 0, 0);
  if (shifted.getTime() <= fireAt) shifted.setDate(shifted.getDate() + 1);
  return shifted.getTime();
}

export interface ClassNotifyOptions {
  /** 下课提醒（模块 05 #3） */
  includeEndOfClass?: boolean;
  /** 今日第一节课程摘要（模块 05 #5），提前 60 分钟 */
  includeSummary?: boolean;
  /** 周末上课提醒开关（模块 05 #17），默认开 */
  weekendReminder?: boolean;
  /** 静音时段（模块 05 #16） */
  quietHours?: QuietHours;
}

function isWeekend(date: string): boolean {
  const dow = new Date(`${date}T00:00:00`).getDay();
  return dow === 0 || dow === 6;
}

/** 变更文案（模块 05 #8/9/11）：调课/补课在提醒中显式标注。 */
function changePrefix(inst: CourseInstance): string {
  if (inst.variant === "adjusted") return "【已调整】";
  if (inst.variant === "extra") return "【补课】";
  return "";
}

/**
 * 由今天的课程实例构建上课提醒（含下课提醒与首课摘要）。
 * minutesBeforeOf: 课程 → 生效的提前分钟数（null = 不提醒）。
 * 只返回未来 24 小时内的提醒；停课/调走的课次不提醒。
 */
export function buildClassNotifications(
  now: Date,
  instances: CourseInstance[],
  minutesBeforeOf: (courseId: string) => number | null,
  options: ClassNotifyOptions = {},
): PendingNotification[] {
  const {
    includeEndOfClass = false,
    includeSummary = false,
    weekendReminder = true,
    quietHours,
  } = options;
  const out: PendingNotification[] = [];
  const horizon = now.getTime() + MAX_LOOKAHEAD_MS;
  const quiet = quietHours ?? { enabled: false, start: "00:00", end: "00:00" };

  const scheduled = instances.filter(
    (i) => i.variant !== "cancelled" && i.variant !== "moved-away" && i.startTime && i.endTime,
  );

  for (const inst of scheduled) {
    if (!weekendReminder && isWeekend(inst.date)) continue;
    const minutes = minutesBeforeOf(inst.courseId);
    const classAt = new Date(`${inst.date}T${inst.startTime}:00`).getTime();
    if (Number.isNaN(classAt)) continue;

    if (minutes) {
      const raw = classAt - minutes * 60_000;
      const fireAt = shiftOutOfQuietHours(raw, quiet);
      if (fireAt > now.getTime() && fireAt <= horizon) {
        const location = inst.room ? `在 ${[inst.building, inst.room].filter(Boolean).join(" · ")}` : "";
        const teacher = inst.teacher ? `，${inst.teacher}` : "";
        out.push({
          id: `class-${inst.key}-${minutes}`,
          title: `${changePrefix(inst)}${minutes} 分钟后上课：${inst.courseName}`,
          body: `${inst.date} ${inst.startTime}${location ? ` ${location}` : ""}${teacher}${
            inst.variant === "adjusted" && inst.exceptionNote ? `（${inst.exceptionNote}）` : ""
          }`,
          fireAt,
        });
      }
    }

    if (includeEndOfClass) {
      const endAt = new Date(`${inst.date}T${inst.endTime}:00`).getTime();
      const fireAt = shiftOutOfQuietHours(endAt, quiet);
      if (fireAt > now.getTime() && fireAt <= horizon) {
        out.push({
          id: `eoc-${inst.key}`,
          title: `${changePrefix(inst)}下课：${inst.courseName}`,
          body: `${inst.endTime} 结束${inst.room ? ` @${inst.room}` : ""}`,
          fireAt,
        });
      }
    }
  }

  if (includeSummary && scheduled.length > 0) {
    const first = [...scheduled].sort(
      (a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    )[0];
    if (first?.startTime && (!weekendReminder || !isWeekend(first.date))) {
      const classAt = new Date(`${first.date}T${first.startTime}:00`).getTime();
      const fireAt = shiftOutOfQuietHours(classAt - 60 * 60_000, quiet);
      if (fireAt > now.getTime() && fireAt <= horizon) {
        out.push({
          id: `summary-${first.date}`,
          title: `今日有 ${scheduled.length} 门课`,
          body: `第一节 ${first.startTime} ${first.courseName}${first.room ? ` @${first.room}` : ""}`,
          fireAt,
        });
      }
    }
  }

  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** 待办截止提醒（模块 08 #3）：截止日当天 08:00 提醒未完成待办；逾期未完成的每天轻提醒一次。 */
export function buildTodoNotifications(
  now: Date,
  todos: ScheduleEvent[],
  quietHours?: QuietHours,
): PendingNotification[] {
  const out: PendingNotification[] = [];
  const horizon = now.getTime() + MAX_LOOKAHEAD_MS;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const todo of todos) {
    if (todo.done || todo.category !== "todo") continue;
    const isDueToday = todo.date === today;
    const isOverdue = todo.date < today;
    if (!isDueToday && !isOverdue) continue;
    let fireAt = new Date(`${today}T08:00:00`).getTime();
    if (fireAt <= now.getTime()) fireAt = now.getTime() + 5 * 60_000; // 已过 8 点则 5 分钟后提醒
    fireAt = shiftOutOfQuietHours(fireAt, quietHours ?? { enabled: false, start: "00:00", end: "00:00" });
    if (fireAt > horizon) continue;
    out.push({
      id: `todo-${todo.id}-${today}`,
      title: isDueToday ? `今日截止：${todo.title}` : `逾期提醒：${todo.title}`,
      body: isDueToday ? "今天到期，记得完成" : `原定 ${todo.date}，尚未完成`,
      fireAt,
    });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** 考试提醒：统一提前 30 分钟（考试无课程级覆盖场景）。 */
export function buildExamNotifications(
  now: Date,
  exams: Exam[],
  quietHours?: QuietHours,
): PendingNotification[] {
  const out: PendingNotification[] = [];
  const horizon = now.getTime() + MAX_LOOKAHEAD_MS;
  for (const exam of exams) {
    const examAt = new Date(`${exam.date}T${exam.startTime}:00`).getTime();
    if (Number.isNaN(examAt)) continue;
    const fireAt = shiftOutOfQuietHours(examAt - 30 * 60_000, quietHours ?? { enabled: false, start: "00:00", end: "00:00" });
    if (fireAt <= now.getTime() || fireAt > horizon) continue;
    const location = exam.room ? `在 ${[exam.building, exam.room].filter(Boolean).join(" · ")}` : "";
    out.push({
      id: `exam-${exam.id}`,
      title: `30 分钟后考试：${exam.name}`,
      body: `${exam.date} ${exam.startTime}${location}`,
      fireAt,
    });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** 提醒规则解析：课程覆盖优先于全局。 */
export function makeMinutesResolver(
  globalRule: ReminderRule | undefined,
  courseRules: Map<string, ReminderRule>,
): (courseId: string) => number | null {
  return (courseId: string) => {
    const courseRule = courseRules.get(courseId);
    if (courseRule) return courseRule.enabled ? courseRule.minutesBefore : null;
    if (globalRule) return globalRule.enabled ? globalRule.minutesBefore : null;
    return null;
  };
}
