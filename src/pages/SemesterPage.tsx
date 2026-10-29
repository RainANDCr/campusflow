import { ArchiveRestore, Archive, BookOpen, Check, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveCoursesDialog } from "@/components/schedule/ArchiveCoursesDialog";
import { SemesterFormDialog } from "@/components/schedule/SemesterFormDialog";
import { deleteSemesterCascade, setSemesterArchived } from "@/core/db/semesters";
import {
  createProfile,
  deleteProfile,
  updateProfile,
} from "@/core/db/profiles";
import { db } from "@/core/db/dexie";
import type { Semester } from "@/core/models";
import { getWeekInfo } from "@/core/services/weekCalc";
import { addDaysISO, formatShortDate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/stores/scheduleStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUndoStore } from "@/stores/undoStore";

/** 学期管理：创建、编辑、归档、删除、切换当前学期；每学期内可管理多套课表方案。 */
export function SemesterPage() {
  const activeId = useSettingsStore((s) => s.settings.activeSemesterId);
  const activeProfileId = useSettingsStore((s) => s.settings.activeProfileId);
  const setActiveSemester = useSettingsStore((s) => s.update);
  const resetScheduleView = useScheduleStore((s) => s.reset);

  const semesters = useLiveQuery(
    () =>
      db.semesters
        .orderBy("startDate")
        .reverse()
        .toArray(),
    [],
  );
  const allProfiles = useLiveQuery(() => db.timetableProfiles.toArray(), []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | undefined>();
  const [deleting, setDeleting] = useState<Semester | undefined>();
  const [profileCreatorFor, setProfileCreatorFor] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [archiveViewing, setArchiveViewing] = useState<Semester | undefined>();

  const activate = (id: string) => {
    setActiveSemester({ activeSemesterId: id, activeProfileId: undefined });
    resetScheduleView();
  };

  const activateProfile = (profileId: string, semesterId: string) => {
    setActiveSemester({ activeSemesterId: semesterId, activeProfileId: profileId });
    resetScheduleView();
  };

  const submitNewProfile = async (semesterId: string) => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileError("请填写方案名称");
      return;
    }
    setProfileError(null);
    try {
      const created = await createProfile(semesterId, { name });
      setNewProfileName("");
      setProfileCreatorFor(null);
      activateProfile(created.id, semesterId);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "创建失败");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">学期</h1>
          <p className="text-sm text-muted-foreground">
            每个学期拥有独立的课程表与节次时间配置
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          创建学期
        </Button>
      </header>

      {semesters === undefined ? null : semesters.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="还没有学期"
          description="设置名称、开学日期、教学周数与每周起始日。教学周与单双周都将以你设定的周序号计算。"
        />
      ) : (
        <ul className="space-y-2.5">
          {semesters.map((s) => {
            const active = s.id === activeId;
            const spanEnd = addDaysISO(s.weekOneAnchor, s.totalWeeks * 7 - 1);
            const weekInfo = getWeekInfo(s, todayISO());
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-2xl border bg-card p-4",
                  active && "border-primary/60 ring-1 ring-primary/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{s.name}</p>
                      {active ? <Badge>当前</Badge> : null}
                      <Badge variant={s.status === "current" ? "secondary" : "outline"}>
                        {s.status === "current" ? "进行中" : "已归档"}
                      </Badge>
                      {weekInfo.phase !== "teaching" ? (
                        <Badge variant="outline">
                          {weekInfo.phase === "before" ? "未开学" : "假期中"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">第 {weekInfo.week} 周</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatShortDate(s.weekOneAnchor)} ~ {formatShortDate(spanEnd)} ·{" "}
                      {s.totalWeeks} 教学周 · 每周起始
                      {s.weekStartsOn === 1 ? "周一" : "周日"}
                    </p>

                    {/* 课表方案 */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      {(allProfiles ?? [])
                        .filter((p) => p.semesterId === s.id)
                        .sort((a, b) => b.isPrimary - a.isPrimary || a.order - b.order)
                        .map((p) => {
                          const isActive = activeProfileId === p.id;
                          return (
                            <span
                              key={p.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                                isActive
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "text-muted-foreground",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => activateProfile(p.id, s.id)}
                                title="切换到此课表方案"
                              >
                                {p.name}
                                {p.isPrimary === 1 ? " ·主" : ""}
                              </button>
                              {p.isPrimary === 0 ? (
                                <button
                                  type="button"
                                  aria-label={`设主 ${p.name}`}
                                  title="设为主课表"
                                  onClick={() => void updateProfile(p.id, { isPrimary: 1 })}
                                  className="text-muted-foreground/70 hover:text-foreground"
                                >
                                  ★
                                </button>
                              ) : null}
                              {p.isPrimary === 0 ? (
                                <button
                                  type="button"
                                  aria-label={`删除 ${p.name}`}
                                  title="删除方案（课程回到主方案）"
                                  onClick={() => {
                                    void deleteProfile(p.id).catch((err: unknown) => {
                                      setProfileError(
                                        err instanceof Error ? err.message : "删除失败",
                                      );
                                    });
                                  }}
                                  className="text-muted-foreground/70 hover:text-destructive"
                                >
                                  ×
                                </button>
                              ) : null}
                            </span>
                          );
                        })}
                      {profileCreatorFor === s.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Input
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitNewProfile(s.id);
                              if (e.key === "Escape") setProfileCreatorFor(null);
                            }}
                            placeholder="方案名称"
                            className="h-7 w-28 text-xs"
                            autoFocus
                          />
                          <Button size="sm" variant="outline" onClick={() => void submitNewProfile(s.id)}>
                            确定
                          </Button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileCreatorFor(s.id);
                            setNewProfileName("");
                          }}
                          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                          新方案
                        </button>
                      )}
                    </div>
                    {profileError ? (
                      <p className="mt-1 text-xs text-destructive">{profileError}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!active ? (
                      <Button variant="outline" size="sm" onClick={() => activate(s.id)}>
                        <Check className="h-3.5 w-3.5" />
                        设为当前
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑学期"
                      onClick={() => {
                        setEditing(s);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="查看历史课程"
                      title="只读查看该学期全部课程"
                      onClick={() => setArchiveViewing(s)}
                    >
                      <BookOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={s.status === "current" ? "归档学期" : "取消归档"}
                      title={s.status === "current" ? "归档（历史学期）" : "恢复为进行中"}
                      onClick={() => void setSemesterArchived(s.id, s.status === "current")}
                    >
                      {s.status === "current" ? (
                        <Archive className="h-4 w-4" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除学期"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen ? (
        <SemesterFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          semester={editing}
          onSaved={(id) => {
            if (!editing) activate(id); // 新建后自动设为当前学期
          }}
        />
      ) : null}

      {archiveViewing ? (
        <ArchiveCoursesDialog
          open={archiveViewing !== undefined}
          onClose={() => setArchiveViewing(undefined)}
          semester={archiveViewing}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== undefined}
        title="删除学期"
        message={`确定删除「${deleting?.name ?? ""}」？该学期的全部课程、上课安排、调课记录与节次配置将一并删除。删除后可短暂撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (deleting) {
            const target = deleting;
            void deleteSemesterCascade(target.id).then((snapshot) => {
              if (target.id === activeId) {
                setActiveSemester({ activeSemesterId: undefined });
                resetScheduleView();
              }
              if (snapshot) {
                useUndoStore.getState().push({
                  id: `semester-${snapshot.semester.id}`,
                  label: `已删除学期「${snapshot.semester.name}」`,
                  undo: async () => {
                    const { restoreSemesterSnapshot } = await import("@/core/db/semesters");
                    await restoreSemesterSnapshot(snapshot);
                  },
                });
              }
            });
          }
        }}
        onClose={() => setDeleting(undefined)}
      />
    </div>
  );
}
