import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import { createException, updateException, type ExceptionInput } from "@/core/db/courseExceptions";
import {
  type ClassTimeSlot,
  type Course,
  type CourseException,
  type CourseSession,
  type ISODate,
} from "@/core/models";
import { formatDisplayDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const KIND_TABS = [
  { kind: "adjust", label: "调课" },
  { kind: "cancel", label: "停课" },
  { kind: "extra", label: "补课" },
] as const;
type Kind = (typeof KIND_TABS)[number]["kind"];

export interface ExceptionFormDialogProps {
  open: boolean;
  onClose: () => void;
  semesterId: string;
  slots: ClassTimeSlot[];
  /** 目标课程（停课/调课/补课的对象） */
  course: Course;
  /** 停课/调课的目标原始安排与日期 */
  session?: CourseSession;
  originalDate?: ISODate;
  /** 编辑模式：传入要修改的例外记录（kind 固定） */
  existing?: CourseException;
  /** 拖拽预填（模块 02 #18）：调课的目标日期与节次 */
  initAdjust?: { newDate: ISODate; startSlot: number; endSlot: number };
  /** 父组件计算的冲突提示 */
  conflictHint?: string | null;
  onSaved: () => void;
}

/**
 * 调课 / 停课 / 补课表单。单次变更不修改原始重复规则；
 * 删除变更记录即可完全恢复课表。
 */
export function ExceptionFormDialog({
  open,
  onClose,
  semesterId,
  slots,
  course,
  session,
  originalDate,
  existing,
  initAdjust,
  conflictHint,
  onSaved,
}: ExceptionFormDialogProps) {
  const editingKind = existing?.kind;

  // 编辑模式：未传入 session 时按例外记录反查原始安排
  const fetchedSession = useLiveQuery(
    () =>
      existing && existing.kind !== "extra"
        ? db.courseSessions.get(existing.sessionId)
        : undefined,
    [existing?.id],
  );
  const sessionResolved = session ?? fetchedSession ?? undefined;

  const [kind, setKind] = useState<Kind>(existing?.kind ?? "adjust");
  const [date, setDate] = useState<ISODate>(
    existing?.kind === "extra" ? existing.date : originalDate ?? "",
  );
  const [original, setOriginal] = useState<ISODate>(
    existing && existing.kind !== "extra" ? existing.originalDate : originalDate ?? "",
  );
  const [newDate, setNewDate] = useState<ISODate>(
    existing?.kind === "adjust"
      ? (existing.newDate ?? existing.originalDate)
      : (initAdjust?.newDate ?? originalDate ?? ""),
  );
  const [startSlot, setStartSlot] = useState<number>(
    (existing?.kind === "adjust" ? existing.newStartSlot : undefined) ??
      initAdjust?.startSlot ??
      sessionResolved?.startSlot ??
      1,
  );
  const [endSlot, setEndSlot] = useState<number>(
    (existing?.kind === "adjust" ? existing.newEndSlot : undefined) ??
      initAdjust?.endSlot ??
      sessionResolved?.endSlot ??
      1,
  );
  const [room, setRoom] = useState(
    existing?.kind === "adjust" ? (existing.newRoom ?? "") : "",
  );
  const [teacher, setTeacher] = useState(
    existing?.kind === "adjust" ? (existing.newTeacher ?? "") : "",
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const slotOptions = (from: number) =>
    slots.filter((s) => s.index >= from);

  const handleSubmit = () => {
    setError(null);
    let input: ExceptionInput;
    if (kind === "cancel") {
      if (!sessionResolved || !original) return setError("缺少要停课的原始安排");
      input = {
        kind: "cancel",
        semesterId,
        courseId: course.id,
        sessionId: sessionResolved.id,
        originalDate: original,
        note: note.trim() || undefined,
      };
    } else if (kind === "adjust") {
      if (!sessionResolved || !original) return setError("缺少要调课的原始安排");
      const changed =
        (newDate !== "" && newDate !== original) ||
        startSlot !== sessionResolved.startSlot ||
        endSlot !== sessionResolved.endSlot ||
        room.trim() !== "" ||
        teacher.trim() !== "";
      if (!changed) return setError("调课至少需要修改日期、节次、教室或教师其中一项");
      if (!newDate) return setError("请选择调整后的日期");
      input = {
        kind: "adjust",
        semesterId,
        courseId: course.id,
        sessionId: sessionResolved.id,
        originalDate: original,
        newDate: newDate !== original ? newDate : undefined,
        newStartSlot: startSlot !== sessionResolved.startSlot ? startSlot : undefined,
        newEndSlot: endSlot !== sessionResolved.endSlot ? endSlot : undefined,
        newRoom: room.trim() || undefined,
        newTeacher: teacher.trim() || undefined,
        note: note.trim() || undefined,
      };
    } else {
      if (!date) return setError("请选择补课日期");
      input = {
        kind: "extra",
        semesterId,
        courseId: course.id,
        date,
        startSlot,
        endSlot,
        room: room.trim() || undefined,
        teacher: teacher.trim() || undefined,
        note: note.trim() || undefined,
      };
    }
    setSaving(true);
    const run = existing ? updateException(existing.id, input) : createException(input);
    run
      .then(() => {
        setSaving(false);
        onSaved();
        onClose();
      })
      .catch((err: unknown) => {
        setSaving(false);
        setError(err instanceof Error ? err.message : "保存失败，请重试");
      });
  };

  const kindLocked = editingKind !== undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? "编辑变更" : "课程变更"}
      description={`「${course.name}」· 单次变更不影响重复规则，可随时撤销`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {conflictHint ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            {conflictHint}
          </p>
        ) : null}

        {!kindLocked ? (
          <div className="inline-flex rounded-xl bg-muted p-1">
            {KIND_TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                aria-pressed={kind === t.kind}
                onClick={() => setKind(t.kind)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  kind === t.kind ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {sessionResolved ? (
          <div className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            原安排：周{DAY_NAMES[sessionResolved.dayOfWeek - 1]} 第 {sessionResolved.startSlot}-
            {sessionResolved.endSlot} 节
            {original ? ` · ${formatDisplayDate(original)}` : ""}
          </div>
        ) : null}

        {kind === "cancel" ? (
          <Field label="停课日期" hint="仅这一天停课，其他周正常上课">
            <Input type="date" value={original} onChange={(e) => setOriginal(e.target.value)} />
          </Field>
        ) : null}

        {kind === "adjust" ? (
          <>
            <Field label="原上课日期">
              <Input type="date" value={original} onChange={(e) => setOriginal(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="调整后日期" hint="与原日期相同则只改时间/地点">
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="开始节次">
                  <Select
                    value={startSlot}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setStartSlot(v);
                      setEndSlot((old) => Math.max(old, v));
                    }}
                  >
                    {slots.map((s) => (
                      <option key={s.id} value={s.index}>
                        第{s.index}节 {s.startTime}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="结束节次">
                  <Select value={endSlot} onChange={(e) => setEndSlot(Number(e.target.value))}>
                    {slotOptions(startSlot).map((s) => (
                      <option key={s.id} value={s.index}>
                        第{s.index}节 {s.endTime}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="新教室（选填）">
                <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="留空保持不变" />
              </Field>
              <Field label="新教师（选填）">
                <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="留空保持不变" />
              </Field>
            </div>
          </>
        ) : null}

        {kind === "extra" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="补课日期">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="开始节次">
                <Select
                  value={startSlot}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartSlot(v);
                    setEndSlot((old) => Math.max(old, v));
                  }}
                >
                  {slots.map((s) => (
                    <option key={s.id} value={s.index}>
                      第{s.index}节 {s.startTime}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="结束节次">
                <Select value={endSlot} onChange={(e) => setEndSlot(Number(e.target.value))}>
                  {slotOptions(startSlot).map((s) => (
                    <option key={s.id} value={s.index}>
                      第{s.index}节 {s.endTime}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="教室（选填）">
                <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="默认同课程" />
              </Field>
              <Field label="教师（选填）">
                <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="默认同课程" />
              </Field>
            </div>
          </>
        ) : null}

        <Field label="备注（选填）">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：国庆调休、教师出差" />
        </Field>
      </div>
    </Dialog>
  );
}
