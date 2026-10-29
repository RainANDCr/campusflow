import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import { createExam, updateExam, type ExamInput } from "@/core/db/exams";
import { EXAM_KINDS, EXAM_KIND_LABELS, type Exam, type ExamKind } from "@/core/models";

export interface ExamFormDialogProps {
  open: boolean;
  onClose: () => void;
  semesterId: string;
  exam?: Exam;
  onSaved: () => void;
}

/** 考试新增 / 编辑（含类型、重要度与同时段考试冲突检测）。 */
export function ExamFormDialog({
  open,
  onClose,
  semesterId,
  exam,
  onSaved,
}: ExamFormDialogProps) {
  const [name, setName] = useState(exam?.name ?? "");
  const [date, setDate] = useState(exam?.date ?? "");
  const [startTime, setStartTime] = useState(exam?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(exam?.endTime ?? "11:00");
  const [building, setBuilding] = useState(exam?.building ?? "");
  const [room, setRoom] = useState(exam?.room ?? "");
  const [seat, setSeat] = useState(exam?.seat ?? "");
  const [kind, setKind] = useState<ExamKind>(exam?.kind ?? "normal");
  const [priority, setPriority] = useState<"high" | "normal">(exam?.priority ?? "normal");
  const [note, setNote] = useState(exam?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 同时段考试冲突（模块 07 #8）：同日期 × 时间区间相交
  const otherExams = useLiveQuery(
    () =>
      open
        ? db.exams.where("semesterId").equals(semesterId).toArray()
        : Promise.resolve([] as Exam[]),
    [semesterId, open],
  );
  const conflictWith = (otherExams ?? []).find(
    (e) =>
      e.id !== exam?.id &&
      e.date === date &&
      startTime < e.endTime &&
      e.startTime < endTime,
  );

  const handleSubmit = () => {
    setError(null);
    if (!name.trim()) return setError("请填写考试名称");
    if (!date) return setError("请选择考试日期");
    const input: ExamInput = {
      name,
      date,
      startTime,
      endTime,
      building: building || undefined,
      room: room || undefined,
      seat: seat || undefined,
      kind,
      priority,
      note: note || undefined,
    };
    setSaving(true);
    const run = exam ? updateExam(exam.id, input) : createExam(semesterId, input);
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
      title={exam ? "编辑考试" : "添加考试"}
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
        <Field label="考试名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：高等数学期末考试"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="日期" className="col-span-3 sm:col-span-1">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="开始时间">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="结束时间">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="考试类型">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ExamKind)}>
              {EXAM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EXAM_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="重要程度">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as "high" | "normal")}>
              <option value="normal">常规</option>
              <option value="high">重要（列表中标注）</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="教学楼（选填）">
            <Input value={building} onChange={(e) => setBuilding(e.target.value)} />
          </Field>
          <Field label="教室（选填）">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
          <Field label="座位号（选填）">
            <Input value={seat} onChange={(e) => setSeat(e.target.value)} />
          </Field>
        </div>
        {conflictWith && date ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            与「{conflictWith.name}」（{conflictWith.date} {conflictWith.startTime}-{conflictWith.endTime}）时间重叠，请确认是否为同一场次或需要调整。
          </p>
        ) : null}
        <Field label="备注（选填）">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="可携带计算器等" />
        </Field>
      </div>
    </Dialog>
  );
}
