import { useLiveQuery } from "dexie-react-hooks";
import { Check, Clock, Copy, MapPin, Pencil, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { db } from "@/core/db/dexie";
import { deleteCourse, duplicateCourse } from "@/core/db/courses";
import { useUndoStore } from "@/stores/undoStore";
import {
  COURSE_TYPE_LABELS,
  type ClassTimeSlot,
  type Semester,
} from "@/core/models";
import type { CourseInstance } from "@/core/services/schedule";
import { weekRuleLabel } from "@/core/services/weekRule";
import { formatDisplayDate } from "@/lib/date";
import { instanceStyle } from "./instanceStyle";
import { ExceptionFormDialog } from "./ExceptionFormDialog";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export interface CourseDetailDialogProps {
  open: boolean;
  onClose: () => void;
  inst: CourseInstance | null;
  semester: Semester;
  slots: ClassTimeSlot[];
  onEdit: (courseId: string) => void;
}

/**
 * 课程详情（从课表卡片点击进入）：
 * 展示本次课程的时间地点 + 该课程全部上课安排，提供编辑 / 复制 / 删除。
 */
export function CourseDetailDialog({
  open,
  onClose,
  inst,
  semester,
  slots,
  onEdit,
}: CourseDetailDialogProps) {
  const course = useLiveQuery(
    () => (inst && open ? db.courses.get(inst.courseId) : undefined),
    [inst?.courseId, open],
  );
  const sessions = useLiveQuery(
    () =>
      inst && open
        ? db.courseSessions
            .where("courseId")
            .equals(inst.courseId)
            .toArray()
        : [],
    [inst?.courseId, open],
  );
  const [exceptionKind, setExceptionKind] = useState<"adjust" | "cancel" | "extra" | null>(null);
  const [copiedRoom, setCopiedRoom] = useState(false);

  if (!inst) return null;
  const start = slots.find((s) => s.index === inst.startSlot);
  const end = slots.find((s) => s.index === inst.endSlot);
  const sorted = [...(sessions ?? [])].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startSlot - b.startSlot,
  );
  const hasOriginalSession = inst.sessionId !== "";

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="课程详情"
        size="md"
        footer={
          course ? (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (window.confirm(`确定删除课程「${course.name}」？其全部上课安排将一并删除。`)) {
                    void deleteCourse(course.id).then((snapshot) => {
                      onClose();
                      if (snapshot) {
                        useUndoStore.getState().push({
                          id: `course-${snapshot.course.id}`,
                          label: `已删除课程「${snapshot.course.name}」`,
                          undo: async () => {
                            const { restoreCourseSnapshot } = await import("@/core/db/courses");
                            await restoreCourseSnapshot(snapshot);
                          },
                        });
                      }
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void duplicateCourse(course.id).then(() => onClose());
                }}
              >
                复制
              </Button>
              <Button onClick={() => onEdit(course.id)}>
                <Pencil className="h-4 w-4" />
                编辑
              </Button>
            </>
          ) : null
        }
      >
        <div className="space-y-5">
          <div
            className="rounded-2xl border p-4"
            style={instanceStyle(inst.color)}
          >
            <p className="text-lg font-semibold">
              {inst.icon ? `${inst.icon} ` : ""}
              {inst.courseName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDisplayDate(inst.date)} · {start?.startTime ?? "—"} -{" "}
                {end?.endTime ?? ""}
              </span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {inst.building || inst.room ? (
                <button
                  type="button"
                  title="点击复制完整地点"
                  onClick={() => {
                    const text = [inst.building, inst.room].filter(Boolean).join(" · ");
                    void navigator.clipboard
                      .writeText(text)
                      .then(() => setCopiedRoom(true))
                      .catch(() => setCopiedRoom(false));
                    setTimeout(() => setCopiedRoom(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg underline-offset-2 hover:underline"
                >
                  {copiedRoom ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  {[inst.building, inst.room].filter(Boolean).join(" · ") || "未填写"}
                  {copiedRoom ? (
                    <Copy className="h-3 w-3 opacity-70" />
                  ) : null}
                </button>
              ) : null}
              {inst.teacher ? (
                <span className="inline-flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {inst.teacher}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary">{COURSE_TYPE_LABELS[inst.type]}</Badge>
            <Badge variant="outline">
              第 {inst.startSlot}-{inst.endSlot} 节
            </Badge>
            {course?.note ? <Badge variant="outline">有备注</Badge> : null}
          </div>

          {/* 课程变更入口（针对本次上课） */}
          {course ? (
            <div className="flex flex-wrap gap-2">
              {hasOriginalSession ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setExceptionKind("adjust")}>
                    调课
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExceptionKind("cancel")}>
                    停课
                  </Button>
                </>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setExceptionKind("extra")}>
                补课
              </Button>
            </div>
          ) : null}

          {course?.note ? (
            <div>
              <p className="text-sm font-medium">备注</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {course.note}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-medium">全部上课安排</p>
            <ul className="mt-2 space-y-1.5">
              {sorted.map((s) => {
                const active = s.id === inst.sessionId;
                return (
                  <li
                    key={s.id}
                    className={
                      active
                        ? "rounded-xl border border-primary/50 bg-primary/5 px-3 py-2 text-sm"
                        : "rounded-xl border px-3 py-2 text-sm"
                    }
                  >
                    <span className="font-medium">
                      周{DAY_NAMES[s.dayOfWeek - 1]} 第 {s.startSlot}-{s.endSlot} 节
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {weekRuleLabel(s.weekRule)} · 共 {semester.totalWeeks} 周
                    </span>
                    {s.room ? (
                      <span className="ml-2 text-muted-foreground">@{s.room}</span>
                    ) : null}
                    {active ? (
                      <Badge className="ml-2" variant="default">
                        本次
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Dialog>

      {exceptionKind && course ? (
        <ExceptionFormDialog
          open
          onClose={() => setExceptionKind(null)}
          semesterId={course.semesterId}
          slots={slots}
          course={course}
          session={hasOriginalSession ? sorted.find((s) => s.id === inst.sessionId) : undefined}
          originalDate={inst.date}
          onSaved={() => undefined}
        />
      ) : null}
    </>
  );
}
