import { CalendarOff, Fullscreen, History, ImageDown, LayoutList, Plus, Printer, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { CourseActionsMenu } from "@/components/schedule/CourseActionsMenu";
import { CourseDetailDialog } from "@/components/schedule/CourseDetailDialog";
import { CourseFormDialog, type CourseFormPrefill } from "@/components/schedule/CourseFormDialog";
import { CoursesManagerDialog } from "@/components/schedule/CoursesManagerDialog";
import { DayList } from "@/components/schedule/DayList";
import { ExportPngDialog } from "@/components/schedule/ExportPngDialog";
import { MonthView } from "@/components/schedule/MonthView";
import { NextClassCard } from "@/components/schedule/NextClassCard";
import { ShareDialog } from "@/components/schedule/ShareDialog";
import { TimelineView } from "@/components/schedule/TimelineView";
import { WeekListView } from "@/components/schedule/WeekListView";
import { ExceptionFormDialog } from "@/components/schedule/ExceptionFormDialog";
import { ExceptionsListDialog } from "@/components/schedule/ExceptionsListDialog";
import { HolidayDialog } from "@/components/schedule/HolidayDialog";
import { ViewToggle, WeekSwitcher } from "@/components/schedule/WeekSwitcher";
import { WeekGrid } from "@/components/schedule/WeekGrid";
import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import type { CourseException, Course } from "@/core/models";
import type { CourseInstance } from "@/core/services/schedule";
import { applyExceptions, buildInstancesForWeek } from "@/core/services/schedule";
import { findConflicts } from "@/core/services/conflict";
import { getDateForDay, getRawWeek, getWeekDates, getWeekInfo } from "@/core/services/weekCalc";
import { formatWeekRange } from "@/core/services/weekCalc";
import { specialWeekOf, SPECIAL_WEEK_LABELS } from "@/core/models";
import { dailyQuote } from "@/core/services/quotes";
import { useNow } from "@/hooks/useNow";
import { useSemesterData } from "@/hooks/useSemesterData";
import { eventConflictsWithClasses, eventOccursOn } from "@/core/services/eventRepeat";
import { db } from "@/core/db/dexie";
import type { ScheduleEvent } from "@/core/models";
import { dayOfWeekOf, formatDisplayDate, isValidISODate, todayISO } from "@/lib/date";
import { useScheduleStore } from "@/stores/scheduleStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUndoStore } from "@/stores/undoStore";
import { TomorrowPreview } from "@/components/schedule/TomorrowPreview";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/**
 * 课表主页：周课表网格 / 日视图 + 教学周切换。
 * 数据全部来自本地 IndexedDB；派生数据由 services 层实时计算。
 */
export function SchedulePage() {
  const {
    semester,
    slots,
    courses,
    sessions,
    exceptions,
    profiles,
    activeProfile,
    loading,
  } = useSemesterData();
  const showWeekend = useSettingsStore((s) => s.settings.showWeekend);
  const showCountdown = useSettingsStore((s) => s.settings.showCountdown);
  const cardDensity = useSettingsStore((s) => s.settings.cardDensity);
  const cardShowRoom = useSettingsStore((s) => s.settings.cardShowRoom);
  const cardShowTeacher = useSettingsStore((s) => s.settings.cardShowTeacher);
  const { view, viewWeek, day, setView, setWeek, setDay, reset } =
    useScheduleStore();
  const now = useNow(30_000);

  const [formOpen, setFormOpen] = useState(false);
  const [editCourseId, setEditCourseId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<CourseFormPrefill | undefined>();
  const [detailInst, setDetailInst] = useState<CourseInstance | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [editingException, setEditingException] = useState<CourseException | null>(null);
  // 快捷菜单（长按/右键）与由此发起的调课/停课
  const [menuTarget, setMenuTarget] = useState<{
    inst: CourseInstance;
    pos: { x: number; y: number };
  } | null>(null);
  const [quickException, setQuickException] = useState<{
    kind: "adjust" | "cancel";
    inst: CourseInstance;
    initAdjust?: { newDate: string; startSlot: number; endSlot: number };
  } | null>(null);
  const [dragConflictHint, setDragConflictHint] = useState<string | null>(null);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const today = todayISO();

  // 学期进度（模块 11 #14）：按教学周比例
  const rawTodayWeek = semester ? getRawWeek(semester, today) : 0;
  const progressRatio = semester
    ? Math.max(0, Math.min(1, rawTodayWeek / semester.totalWeeks))
    : 0;

  const semesterId = semester?.id;
  // 切换学期时重置视图状态
  useEffect(() => {
    reset();
  }, [semesterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekInfo = semester ? getWeekInfo(semester, today) : null;
  const currentWeek =
    weekInfo?.phase === "teaching" ? weekInfo.week : null;
  const viewWeekResolved = viewWeek ?? (currentWeek ?? 1);
  const weekDates = semester
    ? getWeekDates(semester, viewWeekResolved)
    : [];
  const todayDow =
    semester && weekDates.includes(today) ? dayOfWeekOf(today) : null;

  const instances = useMemo(() => {
    if (!semester) return [];
    const base = buildInstancesForWeek(semester, viewWeekResolved, {
      courses,
      sessions,
      slots,
    });
    const courseById = new Map<string, Course>(courses.map((c) => [c.id, c]));
    return applyExceptions(weekDates, base, exceptions, courseById, slots);
  }, [semester, viewWeekResolved, weekDates, courses, sessions, slots, exceptions]);

  const otherSessions = useMemo(() => {
    const nameById = new Map(courses.map((c) => [c.id, c.name]));
    return sessions.map((s) => ({
      ...s,
      courseName: nameById.get(s.courseId) ?? "未知课程",
    }));
  }, [courses, sessions]);

  const openCreate = (p?: CourseFormPrefill) => {
    setEditCourseId(null);
    setPrefill(p);
    setFormOpen(true);
  };

  /** 月历点击某天 → 跳到该天的日视图（跨周/跨月正确换算教学周）。 */
  const pickDay = (date: string) => {
    if (!semester) return;
    const raw = getRawWeek(semester, date);
    setWeek(Math.min(semester.totalWeeks, Math.max(1, raw)));
    setDay(dayOfWeekOf(date));
    setView("day");
  };

  /** 拖拽落点 → 预填调课表单（模块 02 #18）：单次例外，不动重复规则。 */
  const dragDrop = (inst: CourseInstance, dow: number, startSlot: number) => {
    if (!semester) return;
    const dur = inst.endSlot - inst.startSlot;
    const newDate = getDateForDay(semester, viewWeekResolved, dow);
    const initAdjust = {
      newDate,
      startSlot,
      endSlot: Math.min(slots.length, startSlot + dur),
    };
    // 冲突提示：新时段与其他课程（排除本课）节次×周次相交
    const originalSession = sessions.find((s) => s.id === inst.sessionId);
    const candidate = {
      key: "drag-new",
      label: `${inst.courseName}（拖动后）`,
      dayOfWeek: dow,
      startSlot: initAdjust.startSlot,
      endSlot: initAdjust.endSlot,
      weekRule: originalSession?.weekRule ?? { type: "all" as const },
    };
    const others = otherSessions
      .filter((s) => s.id !== inst.sessionId)
      .map((s) => ({
        key: s.id,
        label: s.courseName,
        dayOfWeek: s.dayOfWeek,
        startSlot: s.startSlot,
        endSlot: s.endSlot,
        weekRule: s.weekRule,
      }));
    const found = findConflicts([candidate, ...others], semester.totalWeeks);
    const hint =
      found.length > 0
        ? `注意：新时段与「${found[0]?.bLabel}」等存在时间重叠，保存后请到课表确认。`
        : null;
    setDetailInst(null);
    setQuickException({ kind: "adjust", inst, initAdjust });
    setDragConflictHint(hint);
  };
  const openEdit = (courseId: string) => {
    setDetailInst(null);
    setEditCourseId(courseId);
    setPrefill(undefined);
    setFormOpen(true);
  };

  const [exportPngOpen, setExportPngOpen] = useState(false);

  // ===== 切周：方向动画 + 键盘快捷键 + 触屏滑动 =====
  const [slideDir, setSlideDir] = useState(0);
  const goWeek = (delta: number) => {
    if (!semester) return;
    const next = Math.min(
      semester.totalWeeks,
      Math.max(1, viewWeekResolved + delta),
    );
    if (next === viewWeekResolved) return;
    setSlideDir(delta);
    setWeek(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (document.querySelector("[role='dialog']")) return; // 弹窗打开时不劫持按键
      if (e.key === "ArrowLeft") goWeek(-1);
      else if (e.key === "ArrowRight") goWeek(1);
      else if (e.key === "t" || e.key === "T") setWeek(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // 每次渲染重挂以捕获最新的 viewWeekResolved
  const touchStartX = useRef<number | null>(null);

  // 全屏状态跟随系统事件（F11 / Esc 也能同步图标）
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>;
  }

  if (!semester) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold md:text-2xl">课表</h1>
          <p className="text-sm text-muted-foreground">{formatDisplayDate(today)}</p>
        </header>
        <EmptyState
          icon={GraduationCap}
          title="从创建第一个学期开始"
          description="设置学期名称、开学日期与教学周数后，这里就会显示你的课程表。所有数据保存在本机，离线可用。"
          action={
            <Link to="/semester" className={buttonVariants()}>
              前往学期页
            </Link>
          }
        />
      </div>
    );
  }

  const isVacation = currentWeek === null;
  const specialWeek = specialWeekOf(semester, viewWeekResolved);
  const weekLabel = isVacation
    ? `${weekInfo?.phase === "after" ? "学期已结束" : "开学前"} · 第 ${viewWeekResolved} 周`
    : `第 ${viewWeekResolved} 周`;
  const selectedDay = day ?? todayDow ?? 1;
  const selectedDate = getDateForDay(semester, viewWeekResolved, selectedDay);
  const dayInstances = instances.filter((i) => i.date === selectedDate);
  const editingCourse = editCourseId
    ? courses.find((c) => c.id === editCourseId)
    : undefined;
  const editingCourseSessions = editCourseId
    ? sessions.filter((s) => s.courseId === editCourseId)
    : undefined;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold md:text-2xl">
            课表
            {specialWeek ? (
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                {specialWeek.label ?? SPECIAL_WEEK_LABELS[specialWeek.kind]}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {semester.name} ·{" "}
            <span className={isVacation ? "text-amber-600 dark:text-amber-400" : ""}>
              {weekLabel}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{formatDisplayDate(today)}</p>
          {/* 学期进度条（模块 11 #14） */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              学期进度 {Math.round(progressRatio * 100)}%
            </span>
            {/* 假期/开学倒计时（模块 11 #11-13） */}
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {rawTodayWeek < 1
                ? `距开学 ${Math.abs(rawTodayWeek) * 7 + 1} 天内`
                : rawTodayWeek > semester.totalWeeks
                  ? "学期已结束"
                  : `距学期结束 ${Math.max(0, semester.totalWeeks - rawTodayWeek + 1)} 周`}
            </span>
          </div>
          {/* 每日寄语（模块 16 #4/#11） */}
          <p className="mt-1 text-xs text-muted-foreground/80 italic">{dailyQuote()}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} className="hidden sm:inline-flex" />
          <Button
            variant="outline"
            size="icon"
            aria-label="课程变更记录"
            title="调课 / 停课 / 补课记录"
            onClick={() => setExceptionsOpen(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="节假日课程调整"
            title="节假日批量停课"
            onClick={() => setHolidayOpen(true)}
          >
            <CalendarOff className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="分享课表"
            title="二维码 / 文本分享（可脱敏）"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="课程管理"
            title="搜索与批量管理课程"
            onClick={() => setManagerOpen(true)}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="导出当前周课表图片"
            title="导出当前周课表 PNG（可选脱敏）"
            disabled={!semester}
            onClick={() => setExportPngOpen(true)}
          >
            <ImageDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="打印或导出 PDF"
            title="打印当前页面（浏览器中可选另存为 PDF）"
            className="hidden md:inline-flex"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button className="hidden md:inline-flex" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            添加课程
          </Button>
        </div>
      </header>

      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <WeekSwitcher
          label={`${weekLabel} · ${formatWeekRange(weekDates)}`}
          canPrev={viewWeekResolved > 1}
          canNext={viewWeekResolved < semester.totalWeeks}
          onPrev={() => setWeek(Math.max(1, viewWeekResolved - 1))}
          onNext={() =>
            setWeek(Math.min(semester.totalWeeks, viewWeekResolved + 1))
          }
          onBackToCurrent={() => setWeek(null)}
          showBackToCurrent={viewWeek !== null || isVacation}
        />
        <ViewToggle view={view} onChange={setView} className="sm:hidden" />
      </div>

      {showCountdown && weekDates.includes(today) ? (
        <div className="no-print space-y-2">
          <NextClassCard
            todayInstances={instances.filter((i) => i.date === today)}
            now={now}
          />
          <TomorrowPreview
            semester={semester}
            slots={slots}
            courses={courses}
            sessions={sessions}
            exceptions={exceptions}
            now={now}
          />
        </div>
      ) : null}

      <div className="no-print flex flex-wrap items-center gap-2">
        {/* 日期跳转（模块 02 #11）：选日期 → 跳到该周该天 */}
        <input
          type="date"
          aria-label="跳转到指定日期"
          value={today}
          onChange={(e) => {
            const v = e.target.value;
            if (v && isValidISODate(v)) pickDay(v);
          }}
          className="h-9 rounded-xl border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {/* 全屏课表（模块 02 #21）；不支持的环境自动隐藏 */}
        {typeof document !== "undefined" && document.documentElement.requestFullscreen ? (
          <Button
            variant="outline"
            size="icon"
            aria-label={isFullscreen ? "退出全屏" : "全屏课表"}
            title={isFullscreen ? "退出全屏" : "全屏课表"}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen().catch(() => {});
            }}
          >
            <Fullscreen className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="本学期还没有课程"
          description="点击「添加课程」手动录入，或直接点击课表空白格快速新建。"
          action={
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              添加课程
            </Button>
          }
        />
      ) : view === "week" ? (
        <motion.div
          key={`week-${viewWeekResolved}`}
          initial={{ opacity: 0, x: slideDir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const dx = start - end;
            if (Math.abs(dx) > 60) goWeek(dx > 0 ? 1 : -1);
          }}
        >
          <WeekGrid
            semester={semester}
            week={viewWeekResolved}
            slots={slots}
            instances={instances}
            showWeekend={showWeekend}
            todayDow={todayDow}
            now={now}
            density={cardDensity}
            cardFields={{ room: cardShowRoom, teacher: cardShowTeacher, time: true }}
            onEmptySlotClick={(dow, slot) =>
              openCreate({ dayOfWeek: dow, startSlot: slot, endSlot: slot })
            }
            onInstanceClick={setDetailInst}
            onCardMenu={(inst, pos) => setMenuTarget({ inst, pos })}
            onCardDrop={dragDrop}
          />
        </motion.div>
      ) : view === "month" ? (
        <MonthView
          semester={semester}
          slots={slots}
          courses={courses}
          sessions={sessions}
          exceptions={exceptions}
          initialDate={selectedDate}
          onPickDay={pickDay}
        />
      ) : view === "timeline" ? (
        <motion.div
          key={`tl-${viewWeekResolved}-${selectedDay}`}
          initial={{ opacity: 0, x: slideDir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const dx = start - end;
            if (Math.abs(dx) > 60) {
              setDay(Math.min(7, Math.max(1, selectedDay + (dx > 0 ? 1 : -1))));
            }
          }}
        >
          <DayChips
            dates={weekDates}
            selectedDay={selectedDay}
            today={today}
            onSelect={setDay}
          />
          <p className="mb-3 text-sm text-muted-foreground">
            {formatDisplayDate(selectedDate)}
          </p>
          <TimelineView
            date={selectedDate}
            instances={dayInstances}
            slots={slots}
            now={now}
            onInstanceClick={setDetailInst}
          />
        </motion.div>
      ) : view === "weeklist" ? (
        <WeekListView
          days={weekDates.map((date) => ({
            date,
            label: `周${DAY_NAMES[dayOfWeekOf(date) - 1]}`,
            dayOfWeek: dayOfWeekOf(date),
          }))}
          instances={instances}
          defaultExpandedDate={todayDow !== null ? today : undefined}
          onInstanceClick={setDetailInst}
        />
      ) : (
        <motion.div
          key={`day-${viewWeekResolved}-${selectedDay}`}
          initial={{ opacity: 0, x: slideDir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const dx = start - end;
            if (Math.abs(dx) > 60) {
              setDay(Math.min(7, Math.max(1, selectedDay + (dx > 0 ? 1 : -1))));
            }
          }}
        >
          <DayChips
            dates={weekDates}
            selectedDay={selectedDay}
            today={today}
            onSelect={setDay}
          />
          <p className="mb-3 text-sm text-muted-foreground">
            {formatDisplayDate(selectedDate)}
          </p>
          <DayList
            instances={dayInstances}
            slots={slots}
            now={now}
            onInstanceClick={setDetailInst}
          />
          {/* 个人日程叠加（模块 11 #17/#18） */}
          <DayEventsOverlay date={selectedDate} semesterId={semester.id} classes={dayInstances} />
        </motion.div>
      )}

      {/* 移动端悬浮添加按钮 */}
      <button
        type="button"
        onClick={() => openCreate()}
        aria-label="添加课程"
        className="no-print fixed bottom-20 right-4 z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      {formOpen ? (
        <CourseFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          semester={semester}
          slots={slots}
          profiles={profiles}
          activeProfileId={activeProfile?.id}
          course={editingCourse}
          courseSessions={editingCourseSessions}
          otherSessions={otherSessions}
          prefill={prefill}
          onSaved={() => undefined}
        />
      ) : null}

      <CourseDetailDialog
        open={detailInst !== null}
        onClose={() => setDetailInst(null)}
        inst={detailInst}
        semester={semester}
        slots={slots}
        onEdit={openEdit}
      />

      {managerOpen ? (
        <CoursesManagerDialog
          open={managerOpen}
          onClose={() => setManagerOpen(false)}
          semesterId={semester.id}
          onEditCourse={(courseId) => openEdit(courseId)}
        />
      ) : null}

      {exceptionsOpen ? (
        <ExceptionsListDialog
          open={exceptionsOpen}
          onClose={() => setExceptionsOpen(false)}
          semesterId={semester.id}
          onEdit={(e) => setEditingException(e)}
        />
      ) : null}

      {holidayOpen ? (
        <HolidayDialog
          open={holidayOpen}
          onClose={() => setHolidayOpen(false)}
          semester={semester}
          slots={slots}
          courses={courses}
          sessions={sessions}
          exceptions={exceptions}
          initialStart={weekDates[0] ?? today}
          initialEnd={weekDates[6] ?? today}
          onApplied={(createdIds) => {
            if (createdIds.length === 0) return;
            useUndoStore.getState().push({
              id: `holiday-${Date.now()}`,
              label: `节假日停课 ${createdIds.length} 个课次`,
              undo: async () => {
                const { deleteException } = await import("@/core/db/courseExceptions");
                for (const id of createdIds) await deleteException(id);
              },
            });
          }}
        />
      ) : null}

      {shareOpen ? (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          instances={instances}
          sessions={sessions}
          title={`${semester.name} · 第 ${viewWeekResolved} 周`}
        />
      ) : null}

      {exportPngOpen ? (
        <ExportPngDialog
          open={exportPngOpen}
          onClose={() => setExportPngOpen(false)}
          semester={semester}
          week={viewWeekResolved}
          weekDates={weekDates}
          slots={slots}
          instances={instances}
          showWeekend={showWeekend}
          todayDow={todayDow}
        />
      ) : null}

      {menuTarget ? (
        <CourseActionsMenu
          inst={menuTarget.inst}
          position={menuTarget.pos}
          onClose={() => setMenuTarget(null)}
          onView={(inst) => setDetailInst(inst)}
          onEdit={openEdit}
          onAdjust={(inst) => setQuickException({ kind: "adjust", inst })}
          onCancelClass={(inst) => setQuickException({ kind: "cancel", inst })}
        />
      ) : null}

      {quickException ? (
        <ExceptionFormDialog
          open
          onClose={() => {
            setQuickException(null);
            setDragConflictHint(null);
          }}
          semesterId={semester.id}
          slots={slots}
          course={
            courses.find((c) => c.id === quickException.inst.courseId) ?? {
              id: quickException.inst.courseId,
              semesterId: semester.id,
              name: quickException.inst.courseName,
              type: quickException.inst.type,
              color: quickException.inst.color,
              order: 0,
              createdAt: 0,
              updatedAt: 0,
            }
          }
          session={
            sessions.find((s) => s.id === quickException.inst.sessionId) ?? undefined
          }
          originalDate={quickException.inst.date}
          initAdjust={quickException.initAdjust}
          conflictHint={dragConflictHint}
          onSaved={() => undefined}
        />
      ) : null}

      {editingException ? (
        <ExceptionFormDialog
          open
          onClose={() => setEditingException(null)}
          semesterId={semester.id}
          slots={slots}
          course={
            courses.find((c) => c.id === editingException.courseId) ?? {
              id: editingException.courseId,
              semesterId: semester.id,
              name: "未知课程",
              type: "lecture",
              color: "graphite",
              order: 0,
              createdAt: 0,
              updatedAt: 0,
            }
          }
          existing={editingException}
          onSaved={() => undefined}
        />
      ) : null}
    </div>
  );
}

/** 日视图 / 时间轴共用的星期选择条。 */
function DayChips({
  dates,
  selectedDay,
  today,
  onSelect,
}: {
  dates: string[];
  selectedDay: number;
  today: string;
  onSelect: (day: number) => void;
}) {
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      {dates.map((date) => {
        const dow = dayOfWeekOf(date);
        const active = dow === selectedDay;
        const isToday = date === today;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(dow)}
            className={
              active
                ? "min-w-14 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "min-w-14 rounded-xl border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            }
          >
            周{DAY_NAMES[dow - 1]}
            {isToday ? " ·今" : ""}
          </button>
        );
      })}
    </div>
  );
}

/** 日视图的个人日程叠加（模块 11 #17）：与课程时间重叠时标注冲突（#18）。 */
function DayEventsOverlay({
  date,
  semesterId,
  classes,
}: {
  date: string;
  semesterId: string;
  classes: CourseInstance[];
}) {
  const events = useLiveQuery(
    () => db.scheduleEvents.where("semesterId").equals(semesterId).toArray(),
    [semesterId],
  );
  const dayEvents = ((events ?? []) as ScheduleEvent[]).filter(
    (e) => e.category !== "todo" && eventOccursOn(e, date),
  );
  if (dayEvents.length === 0) return null;

  return (
    <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">当日个人日程</p>
      <ul className="mt-1.5 space-y-1">
        {dayEvents.map((e) => {
          const conflict = eventConflictsWithClasses(e, classes);
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
            >
              <span className="font-medium">{e.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {e.allDay ? "全天" : `${e.startTime ?? ""}${e.endTime ? `-${e.endTime}` : ""}`}
              </span>
              {conflict ? (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                  与课程时间重叠
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
