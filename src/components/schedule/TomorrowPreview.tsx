import { useMemo } from "react";
import type { ClassTimeSlot, Course, CourseException, CourseSession, Semester } from "@/core/models";
import { applyExceptions, buildInstancesForWeek, type CourseInstance } from "@/core/services/schedule";
import { getRawWeek, getWeekDates } from "@/core/services/weekCalc";
import { addDaysISO, dayOfWeekOf, todayISO } from "@/lib/date";

export interface TomorrowPreviewProps {
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  now: Date;
}

/** 明日课程快速预览（模块 02 #8）：正确处理跨周与跨学期边界。 */
export function TomorrowPreview({
  semester,
  slots,
  courses,
  sessions,
  exceptions,
}: TomorrowPreviewProps) {
  const tomorrow = useMemo(() => {
    const today = todayISO();
    const date = addDaysISO(today, 1);
    const rawWeek = getRawWeek(semester, date);
    const weekDates = getWeekDates(semester, rawWeek);
    const base =
      rawWeek >= 1 && rawWeek <= semester.totalWeeks
        ? buildInstancesForWeek(semester, rawWeek, { courses, sessions, slots })
        : [];
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const list = applyExceptions(weekDates, base, exceptions, courseById, slots)
      .filter((i) => i.date === date && i.variant !== "cancelled" && i.variant !== "moved-away")
      .sort((a, b) => a.startSlot - b.startSlot);
    return { date, list, inSemester: rawWeek >= 1 && rawWeek <= semester.totalWeeks };
  }, [semester, slots, courses, sessions, exceptions]);

  if (tomorrow.list.length === 0) {
    if (!tomorrow.inSemester) {
      return (
        <p className="rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          明天（{tomorrow.date.slice(5).replace("-", "/")}）在学期之外，没有课程安排
        </p>
      );
    }
    return (
      <p className="rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
        明天（{tomorrow.date.slice(5).replace("-", "/")} 周
        {"一二三四五六日"[dayOfWeekOf(tomorrow.date) - 1]}）没有课程
      </p>
    );
  }

  const first = tomorrow.list[0];
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-2.5">
      <p className="min-w-0 truncate text-sm text-muted-foreground">
        明天 {tomorrow.list.length} 门课
        {first ? (
          <>
            ：{first.startTime ?? `第${first.startSlot}节`}{" "}
            <span className="font-medium text-foreground">{first.courseName}</span>
            {first.room ? <span className="text-muted-foreground"> @{first.room}</span> : null}
            {tomorrow.list.length > 1 ? <span> 等</span> : null}
          </>
        ) : null}
      </p>
      <CourseDots list={tomorrow.list} />
    </div>
  );
}

function CourseDots({ list }: { list: CourseInstance[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {list.slice(0, 5).map((inst) => (
        <span
          key={inst.key}
          className="h-2 w-2 rounded-full"
          style={{ background: `rgb(var(--course-${inst.color}))` }}
        />
      ))}
    </span>
  );
}
