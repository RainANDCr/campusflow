import { useLiveQuery } from "dexie-react-hooks";
import { CalendarPlus, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import { deleteExam } from "@/core/db/exams";
import { createEvent, deleteEvent, setEventDone } from "@/core/db/scheduleEvents";
import {
  EVENT_CATEGORY_LABELS,
  EVENT_REPEAT_LABELS,
  EXAM_KIND_LABELS,
  TASK_PRIORITY_LABELS,
  type Exam,
  type ScheduleEvent,
} from "@/core/models";
import { useSemesterData } from "@/hooks/useSemesterData";
import { nextOccurrence } from "@/core/services/eventRepeat";
import { addDaysISO, formatShortDate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ExamFormDialog } from "@/components/agenda/ExamFormDialog";
import { EventFormDialog } from "@/components/agenda/EventFormDialog";

type Tab = "exams" | "events" | "todos";

function daysUntil(date: string, today: string): number | null {
  if (date < today) return null;
  if (date === today) return 0;
  let count = 0;
  let cursor = today;
  while (cursor < date && count < 400) {
    cursor = addDaysISO(cursor, 1);
    count += 1;
  }
  return count;
}

function examCountdown(exam: Exam, today: string): string {
  const d = daysUntil(exam.date, today);
  if (d === null) return "已结束";
  if (d === 0) return "今天";
  if (d === 1) return "明天";
  return `还有 ${d} 天`;
}

/** 日程页：考试（倒计时）、个人日程、课程待办。 */
export function AgendaPage() {
  const { semester, courses, loading } = useSemesterData();
  const semesterId = semester?.id;
  const [tab, setTab] = useState<Tab>("exams");
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | undefined>();
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | undefined>();
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoCourse, setNewTodoCourse] = useState("");
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null);

  const today = todayISO();

  const exams = useLiveQuery(
    () =>
      semesterId
        ? db.exams
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) => list.sort((a, b) => a.date.localeCompare(b.date)))
        : Promise.resolve([] as Exam[]),
    [semesterId],
  );
  const events = useLiveQuery(
    () =>
      semesterId
        ? db.scheduleEvents
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) => list.sort((a, b) => a.date.localeCompare(b.date)))
        : Promise.resolve([] as ScheduleEvent[]),
    [semesterId],
  );

  const courseNameById = useMemo(
    () => new Map(courses.map((c) => [c.id, c.name])),
    [courses],
  );
  /** 即将到来的日程：重复日程按下一次发生日期计算（模块 11 #16） */
  const upcomingEvents = useMemo(() => {
    const list: Array<{ event: ScheduleEvent; displayDate: string }> = [];
    for (const e of events ?? []) {
      if (e.done) continue;
      const next = nextOccurrence(e, today);
      if (next) list.push({ event: e, displayDate: next });
    }
    return list.sort((a, b) => a.displayDate.localeCompare(b.displayDate));
  }, [events]);
  const todos = useMemo(() => {
    const list: Array<{ event: ScheduleEvent; overdue: boolean; displayDate: string }> = [];
    for (const e of events ?? []) {
      if (e.category !== "todo") continue;
      // 逾期未完成的待办必须保留展示（拖延可见）；重复待办取下一次发生
      const displayDate = nextOccurrence(e, today) ?? e.date;
      list.push({
        event: e,
        overdue: !e.done && displayDate < today,
        displayDate,
      });
    }
    const order = { high: 0, medium: 1, low: 2 } as const;
    return list.sort((a, b) => {
      if (a.event.done !== b.event.done) return a.event.done ? 1 : -1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (
        a.displayDate.localeCompare(b.displayDate) ||
        order[a.event.priority ?? "medium"] - order[b.event.priority ?? "medium"]
      );
    });
  }, [events]);
  const openTodos = todos.filter((t) => !t.event.done);
  const doneTodos = todos.filter((t) => t.event.done);

  const addTodo = () => {
    const title = newTodoTitle.trim();
    if (!title || !semesterId) return;
    void createEvent(semesterId, {
      title,
      date: today,
      allDay: true,
      category: "todo",
      courseId: newTodoCourse || undefined,
      priority: "medium",
    }).then(() => {
      setNewTodoTitle("");
      setNewTodoCourse("");
    });
  };

  const tabs: Array<[Tab, string, number]> = [
    ["exams", "考试", exams?.filter((e) => e.date >= today).length ?? 0],
    ["events", "日程", upcomingEvents.length],
    ["todos", "待办", openTodos.length],
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">日程</h1>
          <p className="text-sm text-muted-foreground">
            {semester ? semester.name : "未设置学期"} · 与课表联动
          </p>
        </div>
        {(() => {
          const label = tab === "exams" ? "添加考试" : tab === "events" ? "添加日程" : "添加待办";
          return (
            <Button
              onClick={() => {
                setEditingExam(undefined);
                setEditingEvent(undefined);
                if (tab === "exams") setExamFormOpen(true);
                else setEventFormOpen(true);
              }}
              disabled={!semesterId}
            >
              <Plus className="h-4 w-4" />
              {label}
            </Button>
          );
        })()}
      </header>

      {/* Tab 切换 */}
      <div className="inline-flex rounded-xl bg-muted p-1">
        {tabs.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
            {count > 0 ? <span className="ml-1 text-xs opacity-70">{count}</span> : null}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}

      {/* 考试 */}
      {tab === "exams" && !loading ? (
        (exams?.length ?? 0) === 0 ? (
          <EmptyState
            icon={TriangleAlert}
            title="暂无考试安排"
            description="录入考试时间与地点，首页会自动倒计时并提前 30 分钟提醒。"
          />
        ) : (
          <ul className="space-y-2">
            {(exams ?? []).map((exam) => {
              const past = exam.date < today;
              return (
                <li
                  key={exam.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3",
                    past && "opacity-55",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{exam.name}</p>
                      <Badge variant={past ? "outline" : "accent"}>
                        {examCountdown(exam, today)}
                      </Badge>
                      {exam.kind && exam.kind !== "normal" ? (
                        <Badge variant="destructive">{EXAM_KIND_LABELS[exam.kind]}</Badge>
                      ) : null}
                      {exam.priority === "high" ? (
                        <Badge variant="secondary">重要</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatShortDate(exam.date)} {exam.startTime}-{exam.endTime}
                      {exam.room
                        ? ` · ${[exam.building, exam.room].filter(Boolean).join(" ")}`
                        : ""}
                      {exam.seat ? ` · ${exam.seat}` : ""}
                    </p>
                    {exam.note ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{exam.note}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑考试"
                      onClick={() => {
                        setEditingExam(exam);
                        setExamFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除考试"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingExam(exam)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {/* 个人日程 */}
      {tab === "events" && !loading ? (
        upcomingEvents.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="暂无即将到来的日程"
            description="个人日程、临时活动与重要日期都会显示在这里。"
          />
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map(({ event: ev, displayDate }) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{ev.title}</p>
                    <Badge variant="secondary">{EVENT_CATEGORY_LABELS[ev.category]}</Badge>
                    {ev.repeat && ev.repeat !== "none" ? (
                      <Badge variant="outline">{EVENT_REPEAT_LABELS[ev.repeat]}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatShortDate(displayDate)}
                    {ev.repeat && ev.repeat !== "none" ? "（下一次）" : ""}
                    {ev.allDay ? " · 全天" : ` · ${ev.startTime ?? ""}${ev.endTime ? `-${ev.endTime}` : ""}`}
                    {ev.note ? ` · ${ev.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="编辑日程"
                    onClick={() => {
                      setEditingEvent(ev);
                      setEventFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除日程"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingEvent(ev)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* 待办 */}
      {tab === "todos" && !loading ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3">
            <Input
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTodo();
              }}
              placeholder="添加待办，如：带实验报告"
              className="min-w-40 flex-1"
            />
            <select
              value={newTodoCourse}
              onChange={(e) => setNewTodoCourse(e.target.value)}
              aria-label="关联课程（可选）"
              className="h-10 rounded-xl border bg-card px-2 text-sm outline-none"
            >
              <option value="">不关联课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button onClick={addTodo} disabled={!newTodoTitle.trim()}>
              <Plus className="h-4 w-4" />
              添加
            </Button>
          </div>

          {openTodos.length === 0 && doneTodos.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="暂无待办"
              description="课前准备、作业提醒都可以记在这里，可关联到具体课程。"
            />
          ) : (
            <ul className="space-y-1.5">
              {[...openTodos, ...doneTodos].map(({ event: todo, overdue, displayDate }) => (
                <li
                  key={todo.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5",
                    todo.done && "opacity-55",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={todo.done ?? false}
                    onChange={(e) => void setEventDone(todo.id, e.target.checked)}
                    aria-label={`完成 ${todo.title}`}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", todo.done && "line-through")}>
                      {todo.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {todo.courseId
                        ? (courseNameById.get(todo.courseId) ?? "课程已删除")
                        : formatShortDate(displayDate)}
                      {overdue ? (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                          已逾期
                        </span>
                      ) : null}
                      {todo.priority && todo.priority !== "medium" && !todo.done ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px]",
                            todo.priority === "high"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted px-1.5 py-0.5",
                          )}
                        >
                          {TASK_PRIORITY_LABELS[todo.priority]}优先
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除待办"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void deleteEvent(todo.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {examFormOpen && semesterId ? (
        <ExamFormDialog
          open={examFormOpen}
          onClose={() => setExamFormOpen(false)}
          semesterId={semesterId}
          exam={editingExam}
          onSaved={() => undefined}
        />
      ) : null}

      {eventFormOpen && semesterId ? (
        <EventFormDialog
          open={eventFormOpen}
          onClose={() => setEventFormOpen(false)}
          semesterId={semesterId}
          event={editingEvent}
          onSaved={() => undefined}
        />
      ) : null}

      <ConfirmDialog
        open={deletingExam !== null}
        title="删除考试"
        message={`确定删除「${deletingExam?.name ?? ""}」？`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (deletingExam) void deleteExam(deletingExam.id);
        }}
        onClose={() => setDeletingExam(null)}
      />

      <ConfirmDialog
        open={deletingEvent !== null}
        title="删除日程"
        message={`确定删除「${deletingEvent?.title ?? ""}」？`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (deletingEvent) void deleteEvent(deletingEvent.id);
        }}
        onClose={() => setDeletingEvent(null)}
      />
    </div>
  );
}
