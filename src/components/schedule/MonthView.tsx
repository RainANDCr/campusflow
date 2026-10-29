import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { Course, CourseException, CourseSession, ClassTimeSlot, Semester } from "@/core/models";
import { db } from "@/core/db/dexie";
import { applyExceptions, buildInstancesForWeek, type CourseInstance } from "@/core/services/schedule";
import { getRawWeek, getWeekDates, orderedDaysOfWeek } from "@/core/services/weekCalc";
import { toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

export interface MonthViewProps {
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  /** 初始显示的月份（默认取当前查看周所在月） */
  initialDate: string;
  /** 点击某天：跳到该天的日视图 */
  onPickDay: (date: string) => void;
}

/** 月历视图（模块 02 #4）：课程密度圆点 + 考试/日程标记，点击某天进入日视图。 */
export function MonthView({
  semester,
  slots,
  courses,
  sessions,
  exceptions,
  initialDate,
  onPickDay,
}: MonthViewProps) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${initialDate}T00:00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const today = todayISO();

  // 该月覆盖的 6 周网格
  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - ((first.getDay() === 0 ? 7 : first.getDay()) - 1)); // 周一开始
    const cells: Array<{ date: string; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({ date: toISODate(d), inMonth: d.getMonth() === cursor.month });
    }
    return cells;
  }, [cursor]);

  // 一个月可能跨 5-6 个教学周：逐周展开课次
  const instancesByDate = useMemo(() => {
    const byDate = new Map<string, CourseInstance[]>();
    if (grid.length === 0) return byDate;
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const weeks = new Set<number>();
    for (const cell of grid) {
      const raw = getRawWeek(semester, cell.date);
      if (raw >= 1 && raw <= semester.totalWeeks) weeks.add(raw);
    }
    for (const week of weeks) {
      const dates = getWeekDates(semester, week);
      const base = buildInstancesForWeek(semester, week, { courses, sessions, slots });
      for (const inst of applyExceptions(dates, base, exceptions, courseById, slots)) {
        if (inst.variant === "moved-away") continue;
        const arr = byDate.get(inst.date) ?? [];
        arr.push(inst);
        byDate.set(inst.date, arr);
      }
    }
    return byDate;
  }, [grid, semester, courses, sessions, slots, exceptions]);

  // 考试与日程标记
  const monthStart = grid[0]?.date ?? today;
  const monthEnd = grid[grid.length - 1]?.date ?? today;
  const exams = useLiveQuery(
    () =>
      db.exams
        .where("semesterId")
        .equals(semester.id)
        .toArray()
        .then((list) => list.filter((e) => e.date >= monthStart && e.date <= monthEnd)),
    [semester.id, monthStart, monthEnd],
  );
  const events = useLiveQuery(
    () =>
      db.scheduleEvents
        .where("semesterId")
        .equals(semester.id)
        .toArray()
        .then((list) =>
          list.filter((e) => e.date >= monthStart && e.date <= monthEnd && !e.done),
        ),
    [semester.id, monthStart, monthEnd],
  );
  const examByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exams ?? []) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return m;
  }, [exams]);
  const eventByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return m;
  }, [events]);

  const dayOrder = orderedDaysOfWeek(semester.weekStartsOn);
  const dayHeaders =
    semester.weekStartsOn === 1
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="上一月"
          onClick={() =>
            setCursor((c) =>
              c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 },
            )
          }
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold tabular-nums">
          {cursor.year} 年 {cursor.month + 1} 月
        </p>
        <button
          type="button"
          aria-label="下一月"
          onClick={() =>
            setCursor((c) =>
              c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 },
            )
          }
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {dayHeaders.map((h, i) => (
          <div key={`${dayOrder[i]}-${h}`} className="py-1">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {grid.map((cell) => {
          const insts = instancesByDate.get(cell.date) ?? [];
          const isToday = cell.date === today;
          const examCount = examByDate.get(cell.date) ?? 0;
          const eventCount = eventByDate.get(cell.date) ?? 0;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onPickDay(cell.date)}
              className={cn(
                "flex min-h-16 flex-col items-stretch rounded-md border border-transparent p-1 text-left transition-colors hover:border-border",
                !cell.inMonth && "opacity-35",
                isToday && "border-primary/60 bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {Number(cell.date.slice(8, 10))}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-0.5">
                {insts.slice(0, 4).map((inst) => (
                  <span
                    key={inst.key}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: `rgb(var(--course-${inst.color}))` }}
                  />
                ))}
                {insts.length > 4 ? (
                  <span className="text-[8px] leading-3 text-muted-foreground">
                    +{insts.length - 4}
                  </span>
                ) : null}
              </span>
              {examCount > 0 || eventCount > 0 ? (
                <span className="mt-auto flex gap-0.5 pt-0.5">
                  {examCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-destructive/15 px-0.5 text-[8px] text-destructive">
                      <TriangleAlert className="h-2 w-2" />
                      {examCount}
                    </span>
                  ) : null}
                  {eventCount > 0 ? (
                    <span className="rounded bg-accent/15 px-0.5 text-[8px] text-accent-foreground">
                      程 {eventCount}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        点击日期查看当天课程 · 圆点为课程 · △ 为考试 · 「程」为日程
      </p>
    </div>
  );
}
