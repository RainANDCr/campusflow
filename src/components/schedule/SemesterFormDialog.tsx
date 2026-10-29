import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import {
  createSemester,
  updateSemester,
} from "@/core/db/semesters";
import { replaceTimeSlots } from "@/core/db/timeSlots";
import {
  DEFAULT_SLOT_TEMPLATE,
  SLOT_TEMPLATES,
  SPECIAL_WEEK_KINDS,
  SPECIAL_WEEK_LABELS,
  type Semester,
  type SpecialWeek,
  type SpecialWeekKind,
} from "@/core/models";
import { computeWeekOneAnchor } from "@/core/services/weekCalc";
import { dayOfWeekOf } from "@/lib/date";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export interface SemesterFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** 编辑模式传入学期 */
  semester?: Semester;
  onSaved: (semesterId: string) => void;
}

interface SlotForm {
  startTime: string;
  endTime: string;
  /** 缺省 = 通用作息；指定星期 = 该天专属作息（整日替换通用作息） */
  dayOfWeek?: number;
}

const SLOT_SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "每天" },
  { value: "1", label: "仅周一" },
  { value: "2", label: "仅周二" },
  { value: "3", label: "仅周三" },
  { value: "4", label: "仅周四" },
  { value: "5", label: "仅周五" },
  { value: "6", label: "仅周六" },
  { value: "7", label: "仅周日" },
];

/**
 * 学期编辑器：基本信息 + 每周起始日 + 节次时间表。
 * 第一周锚点默认按开学日期自动推算，可手动微调。
 */
export function SemesterFormDialog({
  open,
  onClose,
  semester,
  onSaved,
}: SemesterFormDialogProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [totalWeeks, setTotalWeeks] = useState(20);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(1);
  const [anchor, setAnchor] = useState("");
  const [anchorTouched, setAnchorTouched] = useState(false);
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [specialWeeks, setSpecialWeeks] = useState<SpecialWeek[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 每次打开时重置为学期当前值 / 默认值
  useEffect(() => {
    if (!open) return;
    setName(semester?.name ?? "");
    setStartDate(semester?.startDate ?? "");
    setTotalWeeks(semester?.totalWeeks ?? 20);
    setWeekStartsOn(semester?.weekStartsOn ?? 1);
    setAnchor(semester?.weekOneAnchor ?? "");
    setAnchorTouched(semester !== undefined);
    setSlots(
      semester
        ? [] // 编辑模式在下方异步加载
        : DEFAULT_SLOT_TEMPLATE.map((s) => ({
            startTime: s.startTime,
            endTime: s.endTime,
          })),
    );
    setSpecialWeeks(semester?.specialWeeks ? [...semester.specialWeeks] : []);
    setError(null);
  }, [open, semester]);

  const anchorAuto = startDate
    ? computeWeekOneAnchor(startDate, weekStartsOn)
    : "";

  // 编辑模式：加载现有节次
  useEffect(() => {
    if (!open || !semester) return;
    let cancelled = false;
    void db.timeSlots
      .where("semesterId")
      .equals(semester.id)
      .toArray()
      .then((list) => {
        if (cancelled) return;
          const sorted = list.sort((a, b) => a.index - b.index);
          if (sorted.length > 0) {
            setSlots(
              sorted.map((s) => ({
                startTime: s.startTime,
                endTime: s.endTime,
                dayOfWeek: s.dayOfWeek,
              })),
            );
          }
      });
    return () => {
      cancelled = true;
    };
  }, [open, semester]);

  // 锚点未手动修改时跟随开学日期自动推算
  useEffect(() => {
    if (!anchorTouched && anchorAuto) setAnchor(anchorAuto);
  }, [anchorAuto, anchorTouched]);

  const patchSlot = (i: number, patch: Partial<SlotForm>) => {
    setSlots((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const handleSubmit = () => {
    setError(null);
    if (!name.trim()) return setError("请填写学期名称");
    if (!startDate) return setError("请选择开学日期");
    if (!anchor) return setError("请选择第一周起始日期");
    if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 40) {
      return setError("教学周数需为 1-40 的整数");
    }
    if (slots.length === 0) return setError("至少保留一个节次");

    setSaving(true);
    const run = async () => {
      const input = {
        name,
        startDate,
        weekOneAnchor: anchor,
        totalWeeks,
        weekStartsOn,
        specialWeeks: specialWeeks.filter((w) => w.week >= 1 && w.week <= totalWeeks),
      };
      if (semester) {
        await updateSemester(semester.id, input);
        await replaceTimeSlots(semester.id, slots);
        return semester.id;
      }
      const created = await createSemester(input);
      await replaceTimeSlots(created.id, slots);
      return created.id;
    };
    run()
      .then((id) => {
        setSaving(false);
        onSaved(id);
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
      title={semester ? "编辑学期" : "创建学期"}
      description="学期是课程与时间配置的容器，不同学期使用不同课表"
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

        <Field label="学期名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：2026-2027学年第一学期"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="开学日期" hint="用于判断学期状态">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="教学周数">
            <Input
              type="number"
              min={1}
              max={40}
              value={totalWeeks}
              onChange={(e) => setTotalWeeks(Number(e.target.value) || 0)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="每周起始日" hint="影响课表列顺序与周次划分">
            <Select
              value={weekStartsOn}
              onChange={(e) => setWeekStartsOn(Number(e.target.value) as 0 | 1)}
            >
              <option value={1}>周一</option>
              <option value={0}>周日</option>
            </Select>
          </Field>
          <Field
            label="第一周起始日期"
            hint={
              anchor
                ? `第 1 周从 ${anchor}（${DAY_NAMES[dayOfWeekOf(anchor) - 1]}）开始${
                    anchorAuto && anchor !== anchorAuto ? "，已手动调整" : ""
                  }`
                : "默认为开学日期所在周的第一天"
            }
          >
            <Input
              type="date"
              value={anchor}
              onChange={(e) => {
                setAnchorTouched(true);
                setAnchor(e.target.value);
              }}
            />
          </Field>
        </div>

        {/* 节次时间 */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">节次时间（{slots.length} 节）</p>
            <div className="flex items-center gap-2">
              <select
                aria-label="套用作息模板"
                defaultValue=""
                onChange={(e) => {
                  const t = SLOT_TEMPLATES.find((x) => x.id === e.target.value);
                  if (t) {
                    setSlots(t.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })));
                  }
                  e.target.value = "";
                }}
                className="h-8 rounded-lg border bg-card px-2 text-xs outline-none"
              >
                <option value="">套用作息模板…</option>
                {SLOT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const last = slots[slots.length - 1];
                const start = last ? last.endTime : "08:00";
                const [h, m] = start.split(":").map(Number);
                const endH = Math.min(23, (h ?? 8) + 1);
                setSlots((list) => [
                  ...list,
                  {
                    startTime: start,
                    endTime: `${String(endH).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`,
                  },
                ]);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              添加一节
            </Button>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border p-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={slot.dayOfWeek ?? ""}
                  aria-label={`第 ${i + 1} 节适用星期`}
                  onChange={(e) =>
                    patchSlot(i, {
                      dayOfWeek: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className="h-9 w-20 shrink-0 rounded-lg border bg-card px-1 text-xs outline-none"
                >
                  {SLOT_SCOPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="time"
                  value={slot.startTime}
                  onChange={(e) => patchSlot(i, { startTime: e.target.value })}
                  className="h-9 flex-1"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="time"
                  value={slot.endTime}
                  onChange={(e) => patchSlot(i, { endTime: e.target.value })}
                  className="h-9 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除第 ${i + 1} 节`}
                  disabled={slots.length <= 1}
                  onClick={() => setSlots((list) => list.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            节数与时间完全自定义；某天设置「仅周X」后，该天将整体使用专属作息。
          </p>
        </div>

        {/* 特殊教学周 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">特殊教学周（{specialWeeks.length}）</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSpecialWeeks((list) => [...list, { week: 1, kind: "exam" }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </Button>
          </div>
          {specialWeeks.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border p-2">
              {specialWeeks.map((sw, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">第</span>
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={sw.week}
                    onChange={(e) =>
                      setSpecialWeeks((list) =>
                        list.map((x, idx) =>
                          idx === i
                            ? { ...x, week: Math.max(1, Number(e.target.value) || 1) }
                            : x,
                        ),
                      )
                    }
                    className="h-9 w-16"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">周为</span>
                  <select
                    value={sw.kind}
                    aria-label="特殊周类型"
                    onChange={(e) =>
                      setSpecialWeeks((list) =>
                        list.map((x, idx) =>
                          idx === i
                            ? { ...x, kind: e.target.value as SpecialWeekKind }
                            : x,
                        ),
                      )
                    }
                    className="h-9 flex-1 rounded-lg border bg-card px-2 text-sm outline-none"
                  >
                    {SPECIAL_WEEK_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {SPECIAL_WEEK_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={sw.label ?? ""}
                    onChange={(e) =>
                      setSpecialWeeks((list) =>
                        list.map((x, idx) =>
                          idx === i ? { ...x, label: e.target.value || undefined } : x,
                        ),
                      )
                    }
                    placeholder="备注（选填）"
                    className="h-9 w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="删除特殊周"
                    onClick={() => setSpecialWeeks((list) => list.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            标注考试周、集中实训周、假期周等；课表页对应周会显示角标。
          </p>
        </div>
      </div>
    </Dialog>
  );
}
