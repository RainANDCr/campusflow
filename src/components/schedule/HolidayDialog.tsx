import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { createException } from "@/core/db/courseExceptions";
import type { Course, CourseException, CourseSession, ClassTimeSlot, Semester } from "@/core/models";
import { planHolidayCancels, type PlannedCancel } from "@/core/services/holiday";
import { formatShortDate } from "@/lib/date";

export interface HolidayDialogProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
  slots: ClassTimeSlot[];
  courses: Course[];
  sessions: CourseSession[];
  exceptions: CourseException[];
  /** 预填范围（默认当前查看周的周一到周日） */
  initialStart: string;
  initialEnd: string;
  onApplied: (createdIds: string[]) => void;
}

/**
 * 节假日批量停课（模块 04 #11）：
 * 选择日期范围 → 预览受影响课次 → 确认后生成 cancel 例外（不动重复规则）。
 * 生成的例外可整批撤销。
 */
export function HolidayDialog({
  open,
  onClose,
  semester,
  slots,
  courses,
  sessions,
  exceptions,
  initialStart,
  initialEnd,
  onApplied,
}: HolidayDialogProps) {
  const [rangeStart, setRangeStart] = useState(initialStart);
  const [rangeEnd, setRangeEnd] = useState(initialEnd);
  const [note, setNote] = useState("节假日放假");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validRange = rangeStart !== "" && rangeEnd !== "" && rangeStart <= rangeEnd;

  const planned: PlannedCancel[] = validRange
    ? planHolidayCancels({
        semester,
        slots,
        courses,
        sessions,
        exceptions,
        rangeStart,
        rangeEnd,
      })
    : [];

  const apply = async () => {
    setError(null);
    setApplying(true);
    try {
      const createdIds: string[] = [];
      for (const p of planned) {
        const created = await createException({
          kind: "cancel",
          semesterId: semester.id,
          courseId: p.courseId,
          sessionId: p.sessionId,
          originalDate: p.originalDate,
          note: note.trim() || undefined,
        });
        createdIds.push(created.id);
      }
      setApplying(false);
      onApplied(createdIds);
      onClose();
    } catch (err) {
      setApplying(false);
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="节假日课程调整"
      description="范围内全部课次计划为停课；不修改重复规则，可在变更记录中整批撤销"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void apply()} disabled={applying || planned.length === 0}>
            {applying
              ? "处理中…"
              : planned.length > 0
                ? `停课 ${planned.length} 个课次`
                : "范围内无受影响课次"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </Field>
          <Field label="结束日期">
            <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="备注">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：国庆放假" />
        </Field>

        {validRange ? (
          <div>
            <p className="mb-1.5 text-sm font-medium">
              受影响课次预览（{planned.length} 个）
            </p>
            {planned.length === 0 ? (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                该范围内没有需要停课的课次（可能本来就是空闲或已停课）
              </p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border p-2 text-sm">
                {planned.map((p) => (
                  <li
                    key={`${p.sessionId}@${p.originalDate}`}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5"
                  >
                    <span className="font-medium">{p.courseName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatShortDate(p.originalDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-destructive">请选择有效的日期范围（开始不晚于结束）</p>
        )}
      </div>
    </Dialog>
  );
}
