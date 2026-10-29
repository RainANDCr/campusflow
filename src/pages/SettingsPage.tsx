import { Check } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { db } from "@/core/db/dexie";
import { setGlobalClassReminder } from "@/core/db/reminderRules";
import { getNotificationAdapter } from "@/core/platform";
import { collectBackup, parseBackupJson, restoreBackup, type ImportReport } from "@/core/db/backup";
import { encryptText, isEncryptedBackup, decryptText } from "@/core/db/cryptoBackup";
import { getAutoBackups, getAutoBackupData } from "@/core/db/autoBackup";
import {
  getAIConfig,
  saveAIConfig,
  clearAIConfig,
  type AIConfig,
} from "@/core/db/aiAdapter";
import {
  getWebDAVConfig,
  saveWebDAVConfig,
  clearWebDAVConfig,
  testWebDAVConnection,
  uploadToWebDAV,
  restoreFromWebDAV,
  type WebDAVConfig,
} from "@/core/db/webdav";
import { platform } from "@/core/platform/detect";
import { exportCoursesRows } from "@/core/services/csv";
import { buildSemesterIcs } from "@/core/services/ics";
import {
  CARD_DENSITIES,
  CARD_DENSITY_LABELS,
  THEME_MODES,
  THEME_MODE_LABELS,
  type BackupFile,
  type CardDensity,
} from "@/core/models";
import { downloadBlob, downloadText } from "@/lib/download";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSemesterData } from "@/hooks/useSemesterData";
import { ACCENTS, THEMES } from "@/theme/themes";
import { ImportWizardDialog } from "@/components/data/ImportWizardDialog";
import { HelpDialog } from "@/components/system/HelpDialog";

const REMINDER_OPTIONS = [
  { value: "off", label: "关闭提醒" },
  { value: "5", label: "提前 5 分钟" },
  { value: "10", label: "提前 10 分钟" },
  { value: "15", label: "提前 15 分钟" },
  { value: "30", label: "提前 30 分钟" },
  { value: "60", label: "提前 60 分钟" },
] as const;

/** 设置页：外观 / 通知 / 本机数据 / 关于。 */
export function SettingsPage() {
  const { settings, update } = useSettingsStore();
  const semesters = useLiveQuery(() => db.semesters.count(), []);
  const courses = useLiveQuery(() => db.courses.count(), []);
  const sessions = useLiveQuery(() => db.courseSessions.count(), []);
  const events = useLiveQuery(() => db.scheduleEvents.count(), []);
  const exams = useLiveQuery(() => db.exams.count(), []);

  // 通知权限状态
  const [permission, setPermission] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const globalRule = useLiveQuery(
    () => db.reminderRules.where("scope").equals("global").toArray(),
    [],
  );
  const globalMinutes =
    (globalRule ?? []).find((r) => r.kind === "class" && r.enabled)?.minutesBefore ?? null;

  useEffect(() => {
    void getNotificationAdapter()
      .getPermissionState()
      .then((state) => {
        setPermission(state);
      });
  }, []);

  const requestPermission = () => {
    void getNotificationAdapter()
      .requestPermission()
      .then((state) => setPermission(state));
  };

  // ===== 数据导入导出 =====
  const {
    semester,
    slots: dataSlots,
    courses: dataCourses,
    sessions: dataSessions,
    exceptions: dataExceptions,
  } = useSemesterData();
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [stagedBackup, setStagedBackup] = useState<BackupFile | null>(null);
  const [stagedEncrypted, setStagedEncrypted] = useState<string | null>(null);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [restoreReport, setRestoreReport] = useState<ImportReport | null>(null);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [autoBackups, setAutoBackups] = useState<Array<{ time: number; key: string }>>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  // AI（用户自带 Key，默认关闭）
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [aiDraft, setAiDraft] = useState({ baseUrl: "", model: "", apiKey: "" });

  // WebDAV（用户凭据）
  const [webdav, setWebdav] = useState<WebDAVConfig | null>(null);
  const [webdavDraft, setWebdavDraft] = useState({ url: "", username: "", password: "", directory: "/campusflow" });
  const [webdavMsg, setWebdavMsg] = useState<string | null>(null);

  // 诊断信息（模块 20 #10）
  const exportDiagnostics = async () => {
    const { collectBackup } = await import("@/core/db/backup");
    const backup = await collectBackup();
    const diagnostics = {
      app: "CampusFlow",
      version: "2.0.0",
      platform,
      schemaVersion: backup.meta.schemaVersion,
      counts: backup.meta.counts,
      settings: { themeId: settings.themeId, mode: settings.mode, fontSize: settings.fontSize },
      generatedAt: new Date().toISOString(),
      note: "诊断信息不含课程内容，仅含数量统计与环境信息",
    };
    downloadText(
      `campusflow-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(diagnostics, null, 2),
      "application/json",
    );
    setDataMsg({ ok: true, text: "诊断信息已导出（不含个人课程内容）" });
  };

  const clearAllData = () => {
    if (
      !window.confirm(
        "将删除全部本地数据（学期、课程、考试、日程、提醒设置、AI/WebDAV 配置），且不可恢复。确定继续？",
      )
    )
      return;
    void (async () => {
      const { db } = await import("@/core/db/dexie");
      await db.delete();
      localStorage.removeItem("campusflow.settings");
      window.location.hash = "#/";
      window.location.reload();
    })();
  };

  useEffect(() => {
    void getAIConfig().then((c) => {
      if (c) {
        setAiConfig(c);
        setAiDraft({ baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey });
      }
    });
    void getWebDAVConfig().then((c) => {
      if (c) {
        setWebdav(c);
        setWebdavDraft({ url: c.url, username: c.username, password: c.password, directory: c.directory ?? "/campusflow" });
      }
    });
  }, []);

  useEffect(() => {
    void getAutoBackups().then(setAutoBackups);
  }, [restoreReport, dataMsg]);

  const exportJson = async () => {
    try {
      const backup = await collectBackup();
      const name = `campusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadText(name, JSON.stringify(backup, null, 2), "application/json");
      setDataMsg({ ok: true, text: `备份已导出：${name}` });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "导出失败" });
    }
  };

  const stageBackupFile = async (file: File) => {
    try {
      const text = await file.text();
      if (isEncryptedBackup(text)) {
        setRestoreReport(null);
        setStagedEncrypted(text);
        setStagedBackup(null);
        return;
      }
      const backup = parseBackupJson(text);
      setRestoreReport(null);
      setStagedBackup(backup);
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "文件解析失败" });
    }
  };

  const decryptStaged = async () => {
    if (!stagedEncrypted) return;
    try {
      const plain = await decryptText(stagedEncrypted, decryptPassword);
      setStagedBackup(parseBackupJson(plain));
      setStagedEncrypted(null);
      setDecryptPassword("");
      setDataMsg({ ok: true, text: "解密成功，请选择恢复方式" });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "解密失败" });
    }
  };

  const exportEncrypted = async () => {
    try {
      if (!exportPassword) {
        setDataMsg({ ok: false, text: "请输入加密密码（至少 1 位）" });
        return;
      }
      const backup = await collectBackup();
      const encrypted = await encryptText(JSON.stringify(backup, null, 2), exportPassword);
      const name = `campusflow-backup-encrypted-${new Date().toISOString().slice(0, 10)}.txt`;
      downloadText(name, encrypted, "text/plain");
      setExportPassword("");
      setDataMsg({ ok: true, text: `加密备份已导出：${name}（密码不存储，遗失不可恢复）` });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "导出失败" });
    }
  };

  const restoreAutoBackup = async (key: string) => {
    try {
      const data = await getAutoBackupData(key);
      if (!data) throw new Error("快照不存在");
      const report = await restoreBackup(parseBackupJson(data), "replace");
      const total = Object.values(report.imported).reduce((a, b) => a + b, 0);
      setDataMsg({ ok: true, text: `自动备份已恢复：写入 ${total} 条记录` });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "恢复失败" });
    }
  };

  const doRestore = async (mode: "merge" | "replace") => {
    if (!stagedBackup) return;
    try {
      const report = await restoreBackup(stagedBackup, mode);
      setRestoreReport(report);
      setStagedBackup(null);
      const total = Object.values(report.imported).reduce((a, b) => a + b, 0);
      setDataMsg({ ok: true, text: `恢复完成：写入 ${total} 条记录` });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "恢复失败" });
    }
  };

  const exportCsv = async () => {
    try {
      const { exportCoursesCsv } = await import("@/core/services/csv");
      const csv = exportCoursesCsv(dataCourses.map((course) => ({
        course,
        sessions: dataSessions.filter((s) => s.courseId === course.id),
      })));
      downloadText(`campusflow-courses-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
      setDataMsg({ ok: true, text: "课程清单 CSV 已导出" });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "导出失败" });
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = exportCoursesRows(
        dataCourses.map((course) => ({
          course,
          sessions: dataSessions.filter((s) => s.courseId === course.id),
        })),
      );
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = rows[0]?.map(() => ({ wch: 12 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "课程清单");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      downloadBlob(`campusflow-courses-${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      setDataMsg({ ok: true, text: "课程清单 Excel 已导出" });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "导出失败" });
    }
  };

  const exportIcs = async () => {
    try {
      if (!semester) throw new Error("请先创建学期");
      const ics = buildSemesterIcs(semester, dataCourses, dataSessions, dataSlots, dataExceptions);
      downloadText(`${semester.name}.ics`, ics, "text/calendar");
      setDataMsg({ ok: true, text: "ICS 日历已导出（整学期逐日展开，含调课结果）" });
    } catch (err) {
      setDataMsg({ ok: false, text: err instanceof Error ? err.message : "导出失败" });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold md:text-2xl">设置</h1>
        <p className="text-sm text-muted-foreground">外观与数据保存在本机</p>
      </header>

      {/* 外观 */}
      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>主题即时切换，浅色 / 深色 / 跟随系统</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 主题 */}
          <section className="space-y-2.5">
            <p className="text-sm font-medium">主题</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {THEMES.map((theme) => {
                const active = settings.themeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => update({ themeId: theme.id })}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-muted",
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                      style={{ background: theme.swatches[0] }}
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ background: theme.swatches[1] }}
                      />
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {theme.name}
                    </span>
                    {active ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 显示模式 */}
          <section className="space-y-2.5">
            <p className="text-sm font-medium">显示模式</p>
            <div className="inline-flex rounded-xl bg-muted p-1">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update({ mode })}
                  aria-pressed={settings.mode === mode}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                    settings.mode === mode
                      ? "bg-card shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {THEME_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </section>

          {/* 字号（模块 19 #9） */}
          <section className="space-y-2.5">
            <p className="text-sm font-medium">界面字号</p>
            <div className="inline-flex rounded-xl bg-muted p-1">
              {(
                [
                  ["normal", "标准"],
                  ["large", "大"],
                  ["extra", "特大"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.fontSize === value}
                  onClick={() => update({ fontSize: value })}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                    settings.fontSize === value ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          </section>

          {/* 强调色 */}
          <section className="space-y-2.5">
            <p className="text-sm font-medium">强调色</p>
            <div className="flex flex-wrap gap-2.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  title={accent.name}
                  aria-label={accent.name}
                  aria-pressed={settings.accent === accent.id}
                  onClick={() => update({ accent: accent.id })}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105",
                    settings.accent === accent.id &&
                      "ring-2 ring-offset-2 ring-offset-background",
                  )}
                  style={{
                    background: accent.color,
                    ...(settings.accent === accent.id
                      ? { boxShadow: `0 0 0 2px ${accent.color}` }
                      : {}),
                  }}
                >
                  {settings.accent === accent.id ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          {/* 课表显示 */}
          <section className="space-y-2.5">
            <p className="text-sm font-medium">课表显示</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">卡片密度</span>
              <div className="inline-flex rounded-xl bg-muted p-1">
                {CARD_DENSITIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={settings.cardDensity === d}
                    onClick={() => update({ cardDensity: d as CardDensity })}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      settings.cardDensity === d
                        ? "bg-card shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {CARD_DENSITY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.cardShowRoom}
                  onChange={(e) => update({ cardShowRoom: e.target.checked })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                卡片显示教室
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.cardShowTeacher}
                  onChange={(e) => update({ cardShowTeacher: e.target.checked })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                卡片显示教师
              </label>
            </div>
          </section>

          {/* 装饰 */}
          <section className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">轻二次元装饰</p>
              <p className="text-sm text-muted-foreground">
                氛围光晕 + 漂浮花瓣（浅色）/ 闪烁星空（深色），不影响任何操作
              </p>
            </div>
            <Switch
              checked={settings.decorations}
              onCheckedChange={(v) => update({ decorations: v })}
              aria-label="切换轻二次元装饰"
            />
          </section>
        </CardContent>
      </Card>

      {/* 通知 */}
      <Card>
        <CardHeader>
          <CardTitle>通知</CardTitle>
          <CardDescription>
            上课前本地提醒；应用运行期间可靠触发，浏览器关闭后不保证（平台限制）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">系统通知权限</p>
              <p className="text-sm text-muted-foreground">
                {permission === "granted"
                  ? "已授权，提醒将正常弹出"
                  : permission === "denied"
                    ? "已被拒绝或当前平台暂不支持，请在系统设置中开启"
                    : "尚未授权"}
              </p>
            </div>
            {permission !== "granted" ? (
              <Button variant="outline" size="sm" onClick={requestPermission}>
                授权通知
              </Button>
            ) : (
              <Badge variant="accent">已授权</Badge>
            )}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">全局上课提醒</p>
              <p className="text-sm text-muted-foreground">
                可在每门课程中单独覆盖此设置
              </p>
            </div>
            <Select
              value={globalMinutes === null ? "off" : String(globalMinutes)}
              onChange={(e) => {
                const v = e.target.value;
                void setGlobalClassReminder(v === "off" ? null : Number(v));
              }}
              className="w-40"
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">下节课倒计时</p>
              <p className="text-sm text-muted-foreground">
                在课表页显示当前/下节课程与今日剩余节数
              </p>
            </div>
            <Switch
              checked={settings.showCountdown}
              onCheckedChange={(v) => update({ showCountdown: v })}
              aria-label="切换下节课倒计时"
            />
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">下课提醒</p>
              <p className="text-sm text-muted-foreground">每节课结束时通知（可配合查看下节课教室）</p>
            </div>
            <Switch
              checked={settings.endOfClassReminder}
              onCheckedChange={(v) => update({ endOfClassReminder: v })}
              aria-label="切换下课提醒"
            />
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">今日第一节课摘要</p>
              <p className="text-sm text-muted-foreground">第一节课前 1 小时推送当日课程概览</p>
            </div>
            <Switch
              checked={settings.firstClassSummary}
              onCheckedChange={(v) => update({ firstClassSummary: v })}
              aria-label="切换首课摘要提醒"
            />
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">周末课程提醒</p>
              <p className="text-sm text-muted-foreground">关闭后，周六日的课程不弹通知（课表仍显示）</p>
            </div>
            <Switch
              checked={settings.weekendReminder}
              onCheckedChange={(v) => update({ weekendReminder: v })}
              aria-label="切换周末课程提醒"
            />
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">通知静音时段</p>
                <p className="text-sm text-muted-foreground">
                  落点在窗口内的提醒顺延到窗口结束（支持跨午夜）
                </p>
              </div>
              <Switch
                checked={settings.quietHours.enabled}
                onCheckedChange={(v) =>
                  update({ quietHours: { ...settings.quietHours, enabled: v } })
                }
                aria-label="切换通知静音时段"
              />
            </div>
            {settings.quietHours.enabled ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={settings.quietHours.start}
                  onChange={(e) =>
                    update({ quietHours: { ...settings.quietHours, start: e.target.value } })
                  }
                  className="h-9 w-28"
                  aria-label="静音开始时间"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="time"
                  value={settings.quietHours.end}
                  onChange={(e) =>
                    update({ quietHours: { ...settings.quietHours, end: e.target.value } })
                  }
                  className="h-9 w-28"
                  aria-label="静音结束时间"
                />
              </div>
            ) : null}
          </section>
        </CardContent>
      </Card>

      {/* 数据 */}
      <Card>
        <CardHeader>
          <CardTitle>数据</CardTitle>
          <CardDescription>
            所有数据保存在本机 IndexedDB；备份 / 恢复 / 导入导出全部在本地完成，不会上传
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ["学期", semesters],
              ["课程", courses],
              ["上课安排", sessions],
              ["日程", events],
              ["考试", exams],
            ].map(([label, count]) => (
              <div key={label} className="rounded-xl bg-muted/60 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold">{count ?? "—"}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" onClick={() => void exportJson()}>
              导出 JSON 备份
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted">
              导入 JSON 备份
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void stageBackupFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <Button variant="outline" onClick={() => void exportCsv()}>
              导出课程 CSV
            </Button>
            <Button variant="outline" onClick={() => void exportExcel()}>
              导出课程 Excel
            </Button>
            <Button
              variant="outline"
              disabled={!semester}
              onClick={() => setImportWizardOpen(true)}
            >
              导入 CSV / XLSX
            </Button>
            <Button variant="outline" disabled={!semester} onClick={() => void exportIcs()}>
              导出 ICS 日历
            </Button>
          </div>

          {dataMsg ? (
            <p
              className={cn(
                "rounded-xl px-3 py-2 text-sm",
                dataMsg.ok
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {dataMsg.text}
            </p>
          ) : null}

          {stagedEncrypted ? (
            <div className="rounded-xl border px-3.5 py-3 text-sm">
              <p className="font-medium">该备份已加密，请输入密码解密</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="password"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="备份密码"
                  className="h-9 w-48"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void decryptStaged();
                  }}
                />
                <Button size="sm" onClick={() => void decryptStaged()}>
                  解密
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStagedEncrypted(null)}>
                  取消
                </Button>
              </div>
            </div>
          ) : null}

          {/* 加密导出 */}
          <div className="rounded-xl border p-3">
            <p className="text-sm font-medium">导出加密备份（模块 17 #7）</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AES-GCM 加密，密码不存储；遗失密码将无法恢复数据。
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="设置备份密码"
                className="h-9 w-48"
              />
              <Button variant="outline" size="sm" onClick={() => void exportEncrypted()}>
                导出加密备份
              </Button>
            </div>
          </div>

          {/* 自动备份 */}
          <div className="rounded-xl border p-3">
            <p className="text-sm font-medium">自动本地备份（模块 17 #4）</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              每 24 小时自动在本机保留最近 3 份快照，仅存 IndexedDB，不联网。
            </p>
            {autoBackups.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {autoBackups.map((b) => (
                  <li
                    key={b.key}
                    className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {new Date(b.time).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void restoreAutoBackup(b.key)}
                    >
                      恢复
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                尚未生成（应用运行满 24 小时后出现第一份；也可立即手动导出）。
              </p>
            )}
          </div>

          {stagedBackup ? (
            <div className="rounded-xl border px-3.5 py-3 text-sm">
              <p className="font-medium">
                备份文件：{new Date(stagedBackup.meta.createdAt).toLocaleString()} ·{" "}
                {Object.entries(stagedBackup.meta.counts)
                  .map(([k, v]) => `${k} ${v}`)
                  .join("，")}
              </p>
              <p className="mt-1 text-muted-foreground">
                合并导入：按 ID 覆盖写入，保留现有其他数据。覆盖导入：清空后完整还原（不可撤销）。
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => void doRestore("merge")}>
                  合并导入
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void doRestore("replace")}>
                  覆盖导入
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStagedBackup(null)}>
                  取消
                </Button>
              </div>
            </div>
          ) : null}

          {restoreReport ? (
            <p className="text-xs text-muted-foreground">
              明细：
              {Object.entries(restoreReport.imported)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${k} +${n}`)
                .join("，")}
              {Object.values(restoreReport.skipped).some((n) => n > 0)
                ? "（部分非法记录已跳过）"
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 联网与 AI（默认关闭，用户主动开启） */}
      <Card>
        <CardHeader>
          <CardTitle>联网与 AI（可选）</CardTitle>
          <CardDescription>
            默认完全离线。以下功能使用你自己的服务器与凭据，全部本地保存，不进备份、不打包、不写日志。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* AI */}
          <section className="space-y-2">
            <p className="text-sm font-medium">AI 智能识别（自带 Key）</p>
            <p className="text-xs text-muted-foreground">
              OpenAI 兼容接口；Key 仅存本机 IndexedDB。配置后导入向导的「粘贴文本」页会出现「AI 解析」按钮，结果仅作为提案，导入前仍需确认。
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                value={aiDraft.baseUrl}
                onChange={(e) => setAiDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                placeholder="API 地址，如 https://api.openai.com/v1"
              />
              <Input
                value={aiDraft.model}
                onChange={(e) => setAiDraft((d) => ({ ...d, model: e.target.value }))}
                placeholder="模型名，如 gpt-4o-mini"
              />
              <Input
                type="password"
                value={aiDraft.apiKey}
                onChange={(e) => setAiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                placeholder="API Key"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!aiDraft.baseUrl || !aiDraft.model || !aiDraft.apiKey}
                onClick={() => {
                  const config: AIConfig = { ...aiDraft, enabled: true };
                  void saveAIConfig(config).then(() => {
                    setAiConfig(config);
                    setDataMsg({ ok: true, text: "AI 配置已保存（仅本机）" });
                  });
                }}
              >
                保存 AI 配置
              </Button>
              {aiConfig ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    void clearAIConfig().then(() => {
                      setAiConfig(null);
                      setAiDraft({ baseUrl: "", model: "", apiKey: "" });
                      setDataMsg({ ok: true, text: "AI 配置已清除" });
                    });
                  }}
                >
                  清除
                </Button>
              ) : null}
            </div>
          </section>

          {/* WebDAV */}
          <section className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">WebDAV 同步（自带服务器，如坚果云）</p>
            <p className="text-xs text-muted-foreground">
              凭据仅存本机；同步为手动触发：上传当前备份 / 下载远端备份（由你选择覆盖或合并）。
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={webdavDraft.url}
                onChange={(e) => setWebdavDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="服务器地址，如 https://dav.jianguoyun.com/dav/"
              />
              <Input
                value={webdavDraft.directory}
                onChange={(e) => setWebdavDraft((d) => ({ ...d, directory: e.target.value }))}
                placeholder="目录（默认 /campusflow）"
              />
              <Input
                value={webdavDraft.username}
                onChange={(e) => setWebdavDraft((d) => ({ ...d, username: e.target.value }))}
                placeholder="用户名"
              />
              <Input
                type="password"
                value={webdavDraft.password}
                onChange={(e) => setWebdavDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder="密码 / 应用密码"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!webdavDraft.url || !webdavDraft.username}
                onClick={() => {
                  const config: WebDAVConfig = { ...webdavDraft };
                  void testWebDAVConnection(config).then((r) => {
                    setWebdavMsg(`连接测试：${r.message}`);
                    if (r.ok) {
                      void saveWebDAVConfig(config).then(() => setWebdav(config));
                    }
                  });
                }}
              >
                测试并保存
              </Button>
              {webdav ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void uploadToWebDAV(webdav).then((r) => setWebdavMsg(`上传：${r.message}`))}
                  >
                    上传备份
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void restoreFromWebDAV(webdav, "merge").then((r) => {
                        setWebdavMsg(`已从远端合并 ${r.imported} 条记录`);
                        setRestoreReport(null);
                      });
                    }}
                  >
                    下载并合并
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      void clearWebDAVConfig().then(() => {
                        setWebdav(null);
                        setWebdavMsg("WebDAV 配置已清除");
                      });
                    }}
                  >
                    清除
                  </Button>
                </>
              ) : null}
            </div>
            {webdavMsg ? <p className="text-xs text-muted-foreground">{webdavMsg}</p> : null}
          </section>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>关于</CardTitle>
            <Badge variant="secondary">v2.0</Badge>
          </div>
          <CardDescription>CampusFlow · 为中国大学生设计的跨平台课程表</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>完整功能对照见 docs/FEATURES.md，更新记录见 docs/CHANGELOG.md</li>
            <li>数据 100% 本地存储；云同步/AI 功能仅在用户主动配置后启用</li>
          </ul>
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            使用帮助
          </Button>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => void exportDiagnostics()}>
              导出诊断信息
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={clearAllData}
            >
              清除全部本地数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {helpOpen ? <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} /> : null}

      {importWizardOpen && semester ? (
        <ImportWizardDialog
          open={importWizardOpen}
          onClose={() => setImportWizardOpen(false)}
          semester={semester}
          slots={dataSlots}
          existingSessions={dataSessions.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startSlot: s.startSlot,
            endSlot: s.endSlot,
            weekRule: s.weekRule,
            courseName: dataCourses.find((c) => c.id === s.courseId)?.name ?? "未知课程",
          }))}
          onImported={() => undefined}
        />
      ) : null}
    </div>
  );
}
