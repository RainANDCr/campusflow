import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import { setCourseReminder } from "@/core/db/reminderRules";
import {
  createCourse,
  updateCourse,
  type CourseInput,
} from "@/core/db/courses";
import {
  COURSE_ICONS,
  COURSE_TYPES,
  COURSE_TYPE_LABELS,
  DEFAULT_COURSE_COLOR,
  COURSE_COLORS,
  type Course,
  type CourseSession,
  type ClassTimeSlot,
  type Semester,
  type TimetableProfile,
  type WeekRule,
} from "@/core/models";
import {
  expandSessionToTimes,
  findTimeConflicts,
  type TimeConflict,
} from "@/core/services/conflictTime";
import { addDaysISO, dayOfWeekOf } from "@/lib/date";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function describeTimeConflict(
  c: TimeConflict,
  labels: Map<string, string>,
): string {
  const dow = DAY_NAMES[dayOfWeekOf(c.date) - 1] ?? "";
  const a = labels.get(c.aKey) ?? "?";
  const b = labels.get(c.bKey) ?? "?";
  return `${c.date}（${dow}）${c.startTime}-${c.endTime}：「${a}」与「${b}」时间重叠`;
}

export interface CourseFormPrefill {
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
}

export interface CourseFormDialogProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
  slots: ClassTimeSlot[];
  /** 学期全部课表方案（多套课表） */
  profiles: TimetableProfile[];
  /** 当前激活方案（新建课程默认归属） */
  activeProfileId?: string;
  /** 编辑模式传入课程；新建模式不传 */
  course?: Course;
  /** 编辑模式时的现有排课（用于保留 ID 与冲突排除自身） */
  courseSessions?: CourseSession[];
  /** 学期内其他课程的排课（冲突检测用） */
  otherSessions: Array<CourseSession & { courseName: string }>;
  /** 从课表空白格新建时的预填 */
  prefill?: CourseFormPrefill;
  onSaved: () => void;
}

type RuleMode = WeekRule["type"];

interface SessionForm {
  key: string;
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
  ruleMode: RuleMode;
  rangeFrom: number;
  rangeTo: number;
  customWeeks: number[];
  teacher: string;
  room: string;
}

let sessionKeySeq = 0;
function nextKey() {
  sessionKeySeq += 1;
  return `s-${sessionKeySeq}`;
}

function ruleModeOf(rule: WeekRule): { mode: RuleMode; from: number; to: number; weeks: number[] } {
  switch (rule.type) {
    case "range":
      return { mode: "range", from: rule.from, to: rule.to, weeks: [] };
    case "custom":
      return { mode: "custom", from: 1, to: 8, weeks: [...rule.weeks] };
    default:
      return { mode: rule.type, from: 1, to: 8, weeks: [] };
  }
}

function toWeekRule(s: SessionForm): WeekRule {
  switch (s.ruleMode) {
    case "all":
      return { type: "all" };
    case "odd":
      return { type: "odd" };
    case "even":
      return { type: "even" };
    case "range":
      return { type: "range", from: s.rangeFrom, to: s.rangeTo };
    case "custom":
      return { type: "custom", weeks: s.customWeeks.length > 0 ? [...s.customWeeks].sort((a, b) => a - b) : [1] };
  }
}

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

/**
 * 课程编辑器：课程信息 + 多个上课安排（星期 / 节次 / 周次规则 / 覆盖教师教室）。
 * 保存前做课程内 + 跨课程冲突检测，冲突需用户显式确认。
 */
export function CourseFormDialog({
  open,
  onClose,
  semester,
  slots,
  profiles,
  activeProfileId,
  course,
  courseSessions,
  otherSessions,
  prefill,
  onSaved,
}: CourseFormDialogProps) {
  const slotCount = Math.max(1, slots.length);
  const defaultProfileId =
    course?.profileId ??
    activeProfileId ??
    profiles.find((p) => p.isPrimary === 1)?.id ??
    profiles[0]?.id;

  const initialSessions = (): SessionForm[] => {
    if (course && courseSessions && courseSessions.length > 0) {
      const sorted = [...courseSessions].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startSlot - b.startSlot,
      );
      return sorted.map((s) => {
        const r = ruleModeOf(s.weekRule);
        return {
          key: nextKey(),
          dayOfWeek: s.dayOfWeek,
          startSlot: s.startSlot,
          endSlot: s.endSlot,
          ruleMode: r.mode,
          rangeFrom: r.from,
          rangeTo: r.to,
          customWeeks: r.weeks,
          teacher: s.teacher ?? "",
          room: s.room ?? "",
        };
      });
    }
    if (prefill) {
      return [
        {
          key: nextKey(),
          dayOfWeek: prefill.dayOfWeek,
          startSlot: prefill.startSlot,
          endSlot: Math.max(prefill.endSlot, prefill.startSlot),
          ruleMode: "all",
          rangeFrom: 1,
          rangeTo: semester.totalWeeks,
          customWeeks: [],
          teacher: "",
          room: "",
        },
      ];
    }
    return [
      {
        key: nextKey(),
        dayOfWeek: 1,
        startSlot: 1,
        endSlot: Math.min(2, slotCount),
        ruleMode: "all",
        rangeFrom: 1,
        rangeTo: semester.totalWeeks,
        customWeeks: [],
        teacher: "",
        room: "",
      },
    ];
  };

  const [name, setName] = useState(course?.name ?? "");
  const [teacher, setTeacher] = useState(course?.teacher ?? "");
  const [building, setBuilding] = useState(course?.building ?? "");
  const [room, setRoom] = useState(course?.room ?? "");
  const [type, setType] = useState<Course["type"]>(course?.type ?? "lecture");
  const [color, setColor] = useState(course?.color ?? DEFAULT_COURSE_COLOR);
  const [icon, setIcon] = useState(course?.icon ?? "");
  const [note, setNote] = useState(course?.note ?? "");
  const [tagsText, setTagsText] = useState((course?.tags ?? []).join("，"));
  const [classGroup, setClassGroup] = useState(course?.classGroup ?? "");
  const [profileId, setProfileId] = useState<string | undefined>(defaultProfileId);
  const [sessions, setSessions] = useState<SessionForm[]>(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  // 课程级提醒覆盖（未设置 = 跟随全局）
  const [reminderChoice, setReminderChoice] = useState<"global" | "off" | number>("global");
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    void db.reminderRules
      .where("courseId")
      .equals(course.id)
      .toArray()
      .then((list) => {
        if (cancelled) return;
        const rule = list.find((r) => r.kind === "class");
        setReminderChoice(rule ? (rule.enabled ? rule.minutesBefore : "off") : "global");
      });
    return () => {
      cancelled = true;
    };
  }, [course?.id]);

  const patchSession = (key: string, patch: Partial<SessionForm>) => {
    setSessions((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  };
  const removeSession = (key: string) => {
    setSessions((list) =>
      list.length > 1 ? list.filter((s) => s.key !== key) : list,
    );
  };
  const addSession = () => {
    const last = sessions[sessions.length - 1];
    setSessions((list) => [
      ...list,
      {
        key: nextKey(),
        dayOfWeek: last ? Math.min(7, last.dayOfWeek + 1) : 1,
        startSlot: 1,
        endSlot: Math.min(2, slotCount),
        ruleMode: "all",
        rangeFrom: 1,
        rangeTo: semester.totalWeeks,
        customWeeks: [],
        teacher: "",
        room: "",
      },
    ]);
  };

  const toggleCustomWeek = (key: string, week: number) => {
    const s = sessions.find((x) => x.key === key);
    if (!s) return;
    const has = s.customWeeks.includes(week);
    patchSession(key, {
      customWeeks: has
        ? s.customWeeks.filter((w) => w !== week)
        : [...s.customWeeks, week],
    });
  };

  const resetValidation = () => {
    setError(null);
    setConflicts(null);
  };

  /** 校验输入并返回 CourseInput；不合法返回 null 并设置错误信息。 */
  const buildInput = (): CourseInput | null => {
    if (!name.trim()) {
      setError("请填写课程名称");
      return null;
    }
    for (const [i, s] of sessions.entries()) {
      if (s.endSlot < s.startSlot) {
        setError(`第 ${i + 1} 个上课时间：结束节次不能早于起始节次`);
        return null;
      }
      if (s.ruleMode === "range" && s.rangeFrom > s.rangeTo) {
        setError(`第 ${i + 1} 个上课时间：周次区间起止颠倒`);
        return null;
      }
      if (s.ruleMode === "custom" && s.customWeeks.length === 0) {
        setError(`第 ${i + 1} 个上课时间：请至少勾选一个教学周`);
        return null;
      }
    }
    return {
      name,
      teacher,
      building,
      room,
      type,
      color,
      icon: icon || undefined,
      note: note || undefined,
      tags: tagsText
        .split(/[，,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
      classGroup: classGroup || undefined,
      profileId,
      sessions: sessions.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startSlot: s.startSlot,
        endSlot: s.endSlot,
        weekRule: toWeekRule(s),
        teacher: s.teacher || undefined,
        room: s.room || undefined,
      })),
    };
  };

  /** 保存入口：先做时间感知冲突检测（展开到具体日期时刻）；有冲突需显式确认。 */
  const handleSubmit = (force = false) => {
    const input = buildInput();
    if (!input) return;

    const pseudoCourse: Course = {
      id: "new-course",
      semesterId: semester.id,
      name: input.name,
      type: input.type,
      color: input.color,
      order: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const candidates: CourseSession[] = input.sessions.map((s, i) => ({
      id: `new-${i}`,
      courseId: "new-course",
      semesterId: semester.id,
      dayOfWeek: s.dayOfWeek,
      startSlot: s.startSlot,
      endSlot: s.endSlot,
      weekRule: s.weekRule,
      createdAt: 0,
      updatedAt: 0,
    }));
    const existing = otherSessions
      .filter((s) => s.courseId !== course?.id)
      .map((s) => ({ ...s }));

    const rangeStart = semester.weekOneAnchor;
    const rangeEnd = addDaysISO(rangeStart, semester.totalWeeks * 7 - 1);
    const expandAll = (
      list: CourseSession[],
      courseOf: (s: CourseSession) => Course,
    ) =>
      list.flatMap((s) =>
        expandSessionToTimes({
          session: s,
          course: courseOf(s),
          semester,
          slots,
          rangeStart,
          rangeEnd,
        }),
      );

    const candidateOccs = expandAll(candidates, () => pseudoCourse);
    const existingOccs = expandAll(
      existing,
      (s) =>
        ({
          id: s.courseId,
          semesterId: semester.id,
          name: otherSessions.find((o) => o.id === s.id)?.courseName ?? "已有课程",
          type: "lecture",
          color: "graphite",
          order: 0,
          createdAt: 0,
          updatedAt: 0,
        }) as Course,
    );
    const labels = new Map<string, string>();
    input.sessions.forEach((_, i) => labels.set(`new-${i}`, `${input.name}（安排 ${i + 1}）`));
    for (const s of existing) {
      labels.set(s.id, otherSessions.find((o) => o.id === s.id)?.courseName ?? "已有课程");
    }
    const found = findTimeConflicts([...candidateOccs, ...existingOccs]);
    const relevant = found.filter((c) => c.aKey.startsWith("new-") || c.bKey.startsWith("new-"));

    if (relevant.length > 0 && !force) {
      setConflicts(relevant.map((c) => describeTimeConflict(c, labels)));
      return;
    }

    setSaving(true);
    const run = course
      ? updateCourse(course.id, input).then(() => course.id)
      : createCourse(semester.id, input).then((created) => created.id);
    run
      .then((courseId) =>
        setCourseReminder(
          courseId,
          reminderChoice === "global" || reminderChoice === "off"
            ? reminderChoice
            : Number(reminderChoice),
        ),
      )
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
      onClose={() => {
        resetValidation();
        onClose();
      }}
      title={course ? "编辑课程" : "添加课程"}
      description={`${semester.name} · 第 1-${semester.totalWeeks} 周`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {conflicts ? (
            <Button onClick={() => handleSubmit(true)} disabled={saving}>
              仍要保存
            </Button>
          ) : null}
          <Button onClick={() => handleSubmit(false)} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {conflicts ? (
          <div className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              检测到 {conflicts.length} 处课程时间冲突
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted-foreground">
              {conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted-foreground">
              确认无误可选择「仍要保存」。
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="课程名称">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：高等数学"
              autoFocus
            />
          </Field>
          <Field label="课程类型">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as Course["type"])}
            >
              {COURSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COURSE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="教师（默认）">
            <Input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="选填"
            />
          </Field>
          <Field label="教学楼（默认）">
            <Input
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="选填"
            />
          </Field>
          <Field label="教室（默认）">
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="选填"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {profiles.length > 0 ? (
            <Field label="所属课表方案" hint="同一学期可有多套独立课表">
              <Select
                value={profileId ?? ""}
                onChange={(e) => setProfileId(e.target.value || undefined)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isPrimary === 1 ? "（主）" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="教学班（选填）" hint="同课多班时用于区分，如「2026级1班」">
            <Input
              value={classGroup}
              onChange={(e) => setClassGroup(e.target.value)}
              placeholder="选填"
            />
          </Field>
        </div>

        <Field label="标签（选填）" hint="用逗号分隔，最多 10 个，可用于搜索与筛选">
          <Input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="如：必修，考研课"
          />
        </Field>

        <Field
          label="上课提醒"
          hint="仅对这门课生效，覆盖设置页中的全局提醒"
        >
          <Select
            value={String(reminderChoice)}
            onChange={(e) => {
              const v = e.target.value;
              setReminderChoice(v === "global" || v === "off" ? v : Number(v));
            }}
          >
            <option value="global">跟随全局设置</option>
            <option value="off">不提醒</option>
            <option value="5">提前 5 分钟</option>
            <option value="10">提前 10 分钟</option>
            <option value="15">提前 15 分钟</option>
            <option value="30">提前 30 分钟</option>
            <option value="60">提前 60 分钟</option>
          </Select>
        </Field>

        <Field label="课程颜色">
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.id}
                onClick={() => setColor(c.id)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform hover:scale-105",
                  color === c.id ? "border-foreground/60" : "border-transparent",
                )}
                style={{
                  background: `rgb(var(--course-${c.id}))`,
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="图标（选填）">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={icon === ""}
              onClick={() => setIcon("")}
              className={cn(
                "h-9 w-9 rounded-lg border text-base transition-colors",
                icon === "" ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              ×
            </button>
            {COURSE_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-pressed={icon === emoji}
                onClick={() => setIcon(emoji)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-base transition-colors",
                  icon === emoji ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>

        {/* 上课时间 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              上课时间（{sessions.length}）
            </p>
            <Button type="button" variant="outline" size="sm" onClick={addSession}>
              <Plus className="h-3.5 w-3.5" />
              添加时间
            </Button>
          </div>

          {sessions.map((s, i) => (
            <div key={s.key} className="space-y-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field label={`安排 ${i + 1} · 星期`} className="w-24">
                  <Select
                    value={s.dayOfWeek}
                    onChange={(e) =>
                      patchSession(s.key, { dayOfWeek: Number(e.target.value) })
                    }
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_NAMES[d - 1]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="起始节次" className="w-24">
                  <Select
                    value={s.startSlot}
                    onChange={(e) =>
                      patchSession(s.key, {
                        startSlot: Number(e.target.value),
                        endSlot: Math.max(s.endSlot, Number(e.target.value)),
                      })
                    }
                  >
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.index}>
                        第{slot.index}节 {slot.startTime}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="结束节次" className="w-24">
                  <Select
                    value={s.endSlot}
                    onChange={(e) =>
                      patchSession(s.key, { endSlot: Number(e.target.value) })
                    }
                  >
                    {slots
                      .filter((slot) => slot.index >= s.startSlot)
                      .map((slot) => (
                        <option key={slot.id} value={slot.index}>
                          第{slot.index}节 {slot.endTime}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="周次规则" className="min-w-32 flex-1">
                  <Select
                    value={s.ruleMode}
                    onChange={(e) =>
                      patchSession(s.key, {
                        ruleMode: e.target.value as RuleMode,
                      })
                    }
                  >
                    <option value="all">每周上课</option>
                    <option value="odd">单周</option>
                    <option value="even">双周</option>
                    <option value="range">连续区间</option>
                    <option value="custom">指定周次</option>
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="删除此安排"
                  disabled={sessions.length <= 1}
                  onClick={() => removeSession(s.key)}
                  className="mb-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {s.ruleMode === "range" ? (
                <div className="flex items-end gap-2">
                  <Field label="从第几周" className="w-28">
                    <Input
                      type="number"
                      min={1}
                      max={semester.totalWeeks}
                      value={s.rangeFrom}
                      onChange={(e) =>
                        patchSession(s.key, {
                          rangeFrom: Math.min(
                            semester.totalWeeks,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="到第几周" className="w-28">
                    <Input
                      type="number"
                      min={1}
                      max={semester.totalWeeks}
                      value={s.rangeTo}
                      onChange={(e) =>
                        patchSession(s.key, {
                          rangeTo: Math.min(
                            semester.totalWeeks,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ) : null}

              {s.ruleMode === "custom" ? (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    点击选择上课的教学周（已选 {s.customWeeks.length} 周）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: semester.totalWeeks }, (_, k) => k + 1).map(
                      (w) => {
                        const active = s.customWeeks.includes(w);
                        return (
                          <button
                            key={w}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleCustomWeek(s.key, w)}
                            className={cn(
                              "h-7 w-9 rounded-md border text-xs tabular-nums transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-muted",
                            )}
                          >
                            {w}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={s.teacher}
                  onChange={(e) => patchSession(s.key, { teacher: e.target.value })}
                  placeholder="本时间教师（默认同课程）"
                />
                <Input
                  value={s.room}
                  onChange={(e) => patchSession(s.key, { room: e.target.value })}
                  placeholder="本时间教室（默认同课程）"
                />
              </div>
            </div>
          ))}
        </div>

        <Field label="备注（选填）">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="教材、考核方式等"
          />
        </Field>
      </div>
    </Dialog>
  );
}
