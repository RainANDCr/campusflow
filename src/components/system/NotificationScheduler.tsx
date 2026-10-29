import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import type { Exam } from "@/core/models";
import { db } from "@/core/db/dexie";
import { getNotificationAdapter } from "@/core/platform";
import {
  buildClassNotifications,
  buildExamNotifications,
  buildTodoNotifications,
  makeMinutesResolver,
} from "@/core/services/notifications";
import { applyExceptions, buildInstancesForWeek } from "@/core/services/schedule";
import { getRawWeek, getWeekDates } from "@/core/services/weekCalc";
import { useNow } from "@/hooks/useNow";
import { useSemesterData } from "@/hooks/useSemesterData";
import { useSettingsStore } from "@/stores/settingsStore";
import { todayISO } from "@/lib/date";

/**
 * 无界面组件：把未来 24 小时内的上课/考试提醒交给平台适配器调度。
 * 支持下课提醒、首课摘要、周末开关与静音时段（设置页配置）。
 * 数据或时间变化时自动重排（适配器按稳定 id 去重）。
 */
export function NotificationScheduler() {
  const { semester, slots, courses, sessions, exceptions } = useSemesterData();
  const now = useNow(60_000);
  const endOfClassReminder = useSettingsStore((s) => s.settings.endOfClassReminder);
  const firstClassSummary = useSettingsStore((s) => s.settings.firstClassSummary);
  const weekendReminder = useSettingsStore((s) => s.settings.weekendReminder);
  const quietHours = useSettingsStore((s) => s.settings.quietHours);

  const globalRule = useLiveQuery(() => db.reminderRules.where("scope").equals("global").toArray(), []);
  const courseRules = useLiveQuery(() => db.reminderRules.where("scope").equals("course").toArray(), []);
  const exams = useLiveQuery(
    () =>
      semester
        ? db.exams.where("semesterId").equals(semester.id).toArray()
        : Promise.resolve([] as Exam[]),
    [semester?.id],
  );
  const todos = useLiveQuery(
    () =>
      semester
        ? db.scheduleEvents.where("semesterId").equals(semester.id).toArray()
        : Promise.resolve([] as import("@/core/models").ScheduleEvent[]),
    [semester?.id],
  );

  useEffect(() => {
    if (!semester || slots.length === 0) return;
    const today = todayISO();
    const globalClass = (globalRule ?? []).find((r) => r.kind === "class");
    const courseMap = new Map(
      (courseRules ?? [])
        .filter((r): r is typeof r & { courseId: string } => r.courseId !== undefined)
        .map((r) => [r.courseId, r]),
    );
    const resolver = makeMinutesResolver(globalClass, courseMap);

    // 今天的课程实例（含假期中的补课；停课/调走的实例不提醒）
    const rawWeek = getRawWeek(semester, today);
    const weekDates = getWeekDates(semester, rawWeek);
    const base = buildInstancesForWeek(semester, rawWeek, { courses, sessions, slots });
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const weekInstances = applyExceptions(weekDates, base, exceptions, courseById, slots);
    const todayInstances = weekInstances.filter((i) => i.date === today);

    const pending = [
      ...buildClassNotifications(now, todayInstances, resolver, {
        includeEndOfClass: endOfClassReminder,
        includeSummary: firstClassSummary,
        weekendReminder,
        quietHours,
      }),
      ...buildExamNotifications(now, (exams ?? []).filter((e) => e.date >= today), quietHours),
      ...buildTodoNotifications(
        now,
        ((todos ?? []) as import("@/core/models").ScheduleEvent[]).filter(
          (e) => e.category === "todo",
        ),
        quietHours,
      ),
    ];
    if (pending.length === 0) return;
    const adapter = getNotificationAdapter();
    for (const p of pending) {
      void adapter.scheduleReminder(p);
    }
  }, [
    semester,
    slots,
    courses,
    sessions,
    exceptions,
    globalRule,
    courseRules,
    exams,
    now,
    endOfClassReminder,
    firstClassSummary,
    weekendReminder,
    quietHours,
  ]);

  return null;
}
