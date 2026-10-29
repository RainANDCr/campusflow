import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createEvent, updateEvent, type EventInput } from "@/core/db/scheduleEvents";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_REPEATS,
  EVENT_REPEAT_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type EventRepeat,
  type ScheduleEvent,
  type TaskPriority,
} from "@/core/models";

export interface EventFormDialogProps {
  open: boolean;
  onClose: () => void;
  semesterId?: string;
  event?: ScheduleEvent;
  /** 课程待办场景：固定关联课程 */
  fixedCourseId?: string;
  onSaved: () => void;
}

/** 个人日程 / 活动 / 重要日期 / 待办 的新增与编辑。 */
export function EventFormDialog({
  open,
  onClose,
  semesterId,
  event,
  fixedCourseId,
  onSaved,
}: EventFormDialogProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event?.startTime ?? "19:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "21:00");
  const [category, setCategory] = useState<ScheduleEvent["category"]>(
    event?.category ?? (fixedCourseId ? "todo" : "personal"),
  );
  const [repeat, setRepeat] = useState<EventRepeat>(event?.repeat ?? "none");
  const [priority, setPriority] = useState<TaskPriority>(event?.priority ?? "medium");
  const [note, setNote] = useState(event?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = () => {
    setError(null);
    if (!title.trim()) return setError("请填写标题");
    if (!date) return setError("请选择日期");
    if (!allDay && !startTime) return setError("非全天日程需要开始时间");
    const input: EventInput = {
      title,
      date,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      category,
      courseId: fixedCourseId,
      note: note || undefined,
      repeat,
      priority: category === "todo" ? priority : undefined,
    };
    setSaving(true);
    const run = event ? updateEvent(event.id, input) : createEvent(semesterId, input);
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={event ? "编辑日程" : "添加日程"}
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
        <Field label="标题">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：社团例会、交作业"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="类别">
            <Select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ScheduleEvent["category"])
              }
              disabled={fixedCourseId !== undefined}
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EVENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            全天
          </label>
          {!allDay ? (
            <div className="flex flex-1 items-center gap-2">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9" />
              <span className="text-xs text-muted-foreground">至</span>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9" />
            </div>
          ) : null}
        </div>
        <Field label="重复" hint="每年适合生日与纪念日；重复日程从所选日期开始生效">
          <Select value={repeat} onChange={(e) => setRepeat(e.target.value as EventRepeat)}>
            {EVENT_REPEATS.map((r) => (
              <option key={r} value={r}>
                {EVENT_REPEAT_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        {category === "todo" ? (
          <Field label="优先级">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="备注（选填）">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
