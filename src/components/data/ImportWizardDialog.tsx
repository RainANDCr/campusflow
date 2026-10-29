import { AlertTriangle, CheckCircle2, FileSpreadsheet, ClipboardPaste } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { createCourse } from "@/core/db/courses";
import { recordImport } from "@/core/db/importMeta";
import {
  guessColumnMapping,
  mapCsvRows,
  parseCsv,
  type CsvImportMapping,
  type MappedCourseDraft,
} from "@/core/services/csv";
import { parseAnyText } from "@/core/services/textImport";
import { aiParseTimetable, getAIConfig } from "@/core/db/aiAdapter";
import { weekRuleLabel } from "@/core/services/weekRule";
import type { ClassTimeSlot, Semester, WeekRule } from "@/core/models";
import { cn } from "@/lib/utils";

/** 快速周次展开（与 resolveWeeks 语义一致，供预览判定）。 */
function resolveWeeksLocal(rule: WeekRule, max: number): number[] {
  const out: number[] = [];
  for (let w = 1; w <= max; w++) {
    if (
      rule.type === "all" ||
      (rule.type === "odd" && w % 2 === 1) ||
      (rule.type === "even" && w % 2 === 0) ||
      (rule.type === "range" && w >= rule.from && w <= rule.to) ||
      (rule.type === "custom" && rule.weeks.includes(w))
    ) {
      out.push(w);
    }
  }
  return out;
}

export interface ImportWizardDialogProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
  slots: ClassTimeSlot[];
  /** 现有排课（冲突与重复检测用） */
  existingSessions: Array<{
    dayOfWeek: number;
    startSlot: number;
    endSlot: number;
    weekRule: import("@/core/models").WeekRule;
    courseName: string;
  }>;
  onImported: () => void;
}

type SourceMode = "file" | "text";

const TARGET_FIELDS = [
  { key: "name", label: "课程名称 *" },
  { key: "teacher", label: "教师" },
  { key: "building", label: "教学楼" },
  { key: "room", label: "教室" },
  { key: "day", label: "星期 *" },
  { key: "startSlot", label: "开始节次 *" },
  { key: "endSlot", label: "结束节次" },
  { key: "weeks", label: "周次" },
  { key: "type", label: "类型" },
  { key: "color", label: "颜色" },
  { key: "note", label: "备注" },
] as const;

const DAY_TEXT = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/**
 * 通用结构化数据导入向导（CSV / XLSX / 粘贴文本 / 分享码）：
 * 选择来源 → 解析 →（文件需字段映射）→ 预览与冲突/重复检测 → 确认导入。
 * 全程本地解析；支持保存字段映射模板与查看导入历史。
 */
export function ImportWizardDialog({
  open,
  onClose,
  semester,
  slots,
  existingSessions,
  onImported,
}: ImportWizardDialogProps) {
  const [mode, setMode] = useState<SourceMode>("file");
  const [fileName, setFileName] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvImportMapping | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [textDrafts, setTextDrafts] = useState<MappedCourseDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number; skipped: number } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [history, setHistory] = useState<Array<{ time: number; source: string; imported: number; failed: number }>>([]);
  const [aiReady, setAiReady] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const slotCount = Math.max(1, slots.length);

  useEffect(() => {
    if (!open) return;
    void import("@/core/db/importMeta").then(({ getImportHistory }) =>
      getImportHistory().then(setHistory),
    );
    void getAIConfig().then((c) => setAiReady(c !== null));
  }, [open, result]);

  const runAiParse = async () => {
    setAiBusy(true);
    setError(null);
    try {
      const drafts = await aiParseTimetable(pastedText);
      setTextDrafts(drafts);
      setFileName("");
      setHeader([]);
      setRows([]);
      setMapping(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 解析失败");
    } finally {
      setAiBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setTextDrafts(null);
    setParsing(true);
    setFileName(file.name);
    try {
      let rows2d: string[][];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        const sheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
        if (!sheet) throw new Error("工作簿中没有工作表");
        rows2d = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });
      } else {
        const text = await file.text();
        rows2d = parseCsv(text);
      }
      if (rows2d.length < 2) throw new Error("文件内容不足：需要表头加至少一行数据");
      const head = rows2d[0]?.map((c, i) => (c.trim() ? c.trim() : `列${i + 1}`)) ?? [];
      const guessed = guessColumnMapping(head);
      setHeader(head);
      setRows(rows2d.slice(1));
      setMapping({
        name: guessed.name,
        teacher: guessed.teacher,
        building: guessed.building,
        room: guessed.room,
        day: guessed.day,
        startSlot: guessed.startSlot,
        endSlot: guessed.endSlot,
        weeks: guessed.weeks,
        type: guessed.type,
        color: guessed.color,
        note: guessed.note,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件解析失败");
      setHeader([]);
      setRows([]);
      setMapping(null);
    } finally {
      setParsing(false);
    }
  };

  const handlePaste = () => {
    setError(null);
    setResult(null);
    setFileName("");
    setHeader([]);
    setRows([]);
    setMapping(null);
    const drafts = parseAnyText(pastedText);
    if (drafts.length === 0) {
      setError("未能从文本中识别出任何课程；请检查格式（如：高等数学 周一 1-2节 1-8周 教一101）");
      setTextDrafts(null);
      return;
    }
    setTextDrafts(drafts);
  };

  const drafts: MappedCourseDraft[] = useMemo(() => {
    if (textDrafts) return textDrafts;
    if (!mapping || rows.length === 0) return [];
    return mapCsvRows(rows, mapping, semester.totalWeeks);
  }, [textDrafts, mapping, rows, semester.totalWeeks]);

  /** 同名 + 同类型合并为一门课的多个安排 */
  const merged = useMemo(() => {
    const byName = new Map<string, { name: string; sessions: MappedCourseDraft[]; base: MappedCourseDraft }>();
    for (const d of drafts) {
      if (d.error) continue;
      const entry = byName.get(d.name);
      if (entry) entry.sessions.push(d);
      else byName.set(d.name, { name: d.name, base: d, sessions: [d] });
    }
    return [...byName.values()];
  }, [drafts]);

  /** 重复检测（模块 03 #14）：课程名 + 星期 + 起始节次与现有课程一致 */
  const duplicateNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of merged) {
      for (const s of c.sessions) {
        const hit = existingSessions.some(
          (e) =>
            e.courseName === c.name &&
            e.dayOfWeek === s.dayOfWeek &&
            e.startSlot === s.startSlot,
        );
        if (hit) {
          set.add(c.name);
          break;
        }
      }
    }
    return set;
  }, [merged, existingSessions]);

  const conflicts = useMemo(() => {
    const candidates = merged.flatMap((c) =>
      c.sessions
        .filter((s) => s.dayOfWeek !== null && s.startSlot !== null)
        .map((s, i) => ({
          key: `${c.name}#${i}`,
          label: `${c.name}（导入安排 ${i + 1}）`,
          dayOfWeek: s.dayOfWeek ?? 1,
          startSlot: s.startSlot ?? 1,
          endSlot: s.endSlot ?? s.startSlot ?? 1,
          weekRule: s.weekRule ?? { type: "all" as const },
        })),
    );
    const existing = existingSessions.map((s, i) => ({
      key: `existing-${i}`,
      label: `${s.courseName}（已有）`,
      dayOfWeek: s.dayOfWeek,
      startSlot: s.startSlot,
      endSlot: s.endSlot,
      weekRule: s.weekRule,
    }));
    const all = [...candidates, ...existing];
    const importKeys = new Set(candidates.map((c) => c.key));
    const out: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (!a || !b) continue;
        if (a.dayOfWeek !== b.dayOfWeek) continue;
        if (a.startSlot > b.endSlot || b.startSlot > a.endSlot) continue;
        const shared = resolveWeeksLocal(a.weekRule, semester.totalWeeks).filter((w) =>
          resolveWeeksLocal(b.weekRule, semester.totalWeeks).includes(w),
        );
        if (shared.length === 0) continue;
        if (!importKeys.has(a.key) && !importKeys.has(b.key)) continue;
        const day = DAY_TEXT[a.dayOfWeek - 1] ?? "";
        out.push(
          `「${a.label}」与「${b.label}」：周${day} 第 ${Math.max(a.startSlot, b.startSlot)}-${Math.min(a.endSlot, b.endSlot)} 节，${shared.length} 个周次重叠`,
        );
      }
    }
    return out;
  }, [merged, existingSessions, semester.totalWeeks]);

  const errorCount = drafts.filter((d) => d.error).length;
  const toImport = useMemo(
    () => (skipDuplicates ? merged.filter((c) => !duplicateNames.has(c.name)) : merged),
    [merged, duplicateNames, skipDuplicates],
  );

  const doImport = async () => {
    setImporting(true);
    let ok = 0;
    let failed = 0;
    for (const c of toImport) {
      try {
        await createCourse(semester.id, {
          name: c.name,
          teacher: c.base.teacher,
          building: c.base.building,
          room: c.base.room,
          type: c.base.type,
          color: c.base.color,
          note: c.base.note,
          sessions: c.sessions.map((s) => ({
            dayOfWeek: s.dayOfWeek ?? 1,
            startSlot: Math.min(slotCount, s.startSlot ?? 1),
            endSlot: Math.min(slotCount, s.endSlot ?? s.startSlot ?? 1),
            weekRule: s.weekRule ?? { type: "all" },
          })),
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    const skipped = merged.length - toImport.length;
    setImporting(false);
    setResult({ ok, failed, skipped });
    if (ok > 0) {
      onImported();
      void recordImport({
        source: mode === "text" ? "粘贴文本" : fileName || "文件",
        imported: ok,
        failed,
      });
    }
  };

  const reset = () => {
    setFileName("");
    setHeader([]);
    setRows([]);
    setMapping(null);
    setPastedText("");
    setTextDrafts(null);
    setError(null);
    setResult(null);
  };

  const ready = textDrafts !== null || (mapping !== null && rows.length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="导入课程"
      description={`${semester.name} · CSV / XLSX / 粘贴文本 / 分享码`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={reset} disabled={importing}>
            重新选择
          </Button>
          <Button
            onClick={() => void doImport()}
            disabled={importing || !ready || toImport.length === 0 || result !== null}
          >
            {importing ? "导入中…" : `导入 ${toImport.length} 门课程`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        {/* 来源切换 */}
        <div className="inline-flex rounded-xl bg-muted p-1">
          {(
            [
              ["file", "选择文件", FileSpreadsheet],
              ["text", "粘贴文本 / 分享码", ClipboardPaste],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                reset();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                mode === value ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <>
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors hover:bg-muted/50",
                mapping && "border-primary/50 bg-primary/5",
              )}
            >
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName || "点击选择 CSV / XLSX 文件"}</span>
              <span className="text-xs text-muted-foreground">
                解析在本地完成，文件不会上传到任何服务器
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {parsing ? <p className="text-sm text-muted-foreground">解析中…</p> : null}

            {/* 字段映射 */}
            {mapping ? (
              <div>
                <p className="mb-2 text-sm font-medium">字段映射（已按表头自动匹配，可调整）</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {TARGET_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <Select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMapping((m) =>
                            m ? { ...m, [f.key]: v === "" ? undefined : Number(v) } : m,
                          );
                        }}
                        className="h-9 text-xs"
                      >
                        <option value="">（不导入）</option>
                        {header.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <Field
              label="粘贴课表文本"
              hint="每行一门课，如：高等数学 周一 1-2节 1-8周 教一101；也支持分享码（campusflow-share: 开头）"
            >
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={"高等数学 周一 1-2节 1-8周 教一101\n大学英语 周三 3-4 单周 文B-202\n概率论 周5 5-6 全部"}
                className="min-h-32 font-mono text-xs"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePaste} disabled={!pastedText.trim()}>
                识别文本
              </Button>
              {aiReady ? (
                <Button variant="secondary" onClick={() => void runAiParse()} disabled={!pastedText.trim() || aiBusy}>
                  {aiBusy ? "AI 解析中…" : "AI 解析（提案，需确认）"}
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {/* 预览 */}
        {drafts.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">
              预览：{merged.length} 门课程 / {drafts.length} 行（同名行合并为多个上课时间）
            </p>
            {errorCount > 0 ? (
              <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                {errorCount} 行无法解析（缺少名称/星期/节次），将被跳过
              </p>
            ) : null}
            {duplicateNames.size > 0 ? (
              <div className="mb-2 space-y-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  疑似重复：{[...duplicateNames].join("、")}（与现有课程同名同时间）
                </p>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  跳过疑似重复的课程（{merged.length - toImport.length} 门）
                </label>
              </div>
            ) : null}
            {conflicts.length > 0 ? (
              <div className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {conflicts.length} 处时间冲突（仍可导入，导入后可再调整）
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {conflicts.slice(0, 5).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border p-2">
              {merged.map((c) => (
                <li key={c.name} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <p className="font-medium">
                    {c.name}
                    {duplicateNames.has(c.name) ? (
                      <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                        疑似重复
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {c.sessions.map((s, i) => (
                      <li key={i}>
                        {s.dayOfWeek ? `周${DAY_TEXT[s.dayOfWeek - 1]}` : "星期未知"} · 第{" "}
                        {s.startSlot ?? "?"}-{s.endSlot ?? "?"} 节 ·{" "}
                        {weekRuleLabel(s.weekRule ?? { type: "all" })}
                        {s.room ? ` · ${s.room}` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result ? (
          <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            导入完成：成功 {result.ok} 门
            {result.skipped > 0 ? `，跳过重复 ${result.skipped} 门` : ""}
            {result.failed > 0 ? `，失败 ${result.failed} 门` : ""}
          </p>
        ) : null}

        {history.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">导入历史（最近 {history.length} 次）</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {history.slice(0, 5).map((h, i) => (
                <li key={i}>
                  {new Date(h.time).toLocaleString()} · {h.source} · 成功 {h.imported}
                  {h.failed > 0 ? ` / 失败 ${h.failed}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
