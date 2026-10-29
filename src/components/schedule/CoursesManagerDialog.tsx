import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import { deleteCoursesBatch } from "@/core/db/courses";
import { COURSE_COLORS, type Course, type CourseSession } from "@/core/models";
import { useUndoStore } from "@/stores/undoStore";
import { weekRuleLabel } from "@/core/services/weekRule";
import { cn } from "@/lib/utils";

const DAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];

export interface CoursesManagerDialogProps {
  open: boolean;
  onClose: () => void;
  semesterId: string;
  onEditCourse: (courseId: string) => void;
}

/**
 * 课程管理：搜索、进入编辑；支持勾选多门课程后批量修改颜色或删除。
 */
export function CoursesManagerDialog({
  open,
  onClose,
  semesterId,
  onEditCourse,
}: CoursesManagerDialogProps) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const courses = useLiveQuery(
    () =>
      open
        ? db.courses
            .where("semesterId")
            .equals(semesterId)
            .toArray()
            .then((list) => list.sort((a, b) => a.order - b.order))
        : Promise.resolve([] as Course[]),
    [semesterId, open],
  );
  const sessions = useLiveQuery(
    () =>
      open
        ? db.courseSessions.where("semesterId").equals(semesterId).toArray()
        : Promise.resolve([] as CourseSession[]),
    [semesterId, open],
  );

  const sessionsByCourse = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of sessions ?? []) {
      const arr = map.get(s.courseId) ?? [];
      arr.push(s.dayOfWeek);
      map.set(s.courseId, arr);
    }
    return map;
  }, [sessions]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses ?? []) {
      for (const t of c.tags ?? []) set.add(t);
    }
    return [...set].sort();
  }, [courses]);

  const filtered = (courses ?? []).filter((c) => {
    if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.teacher ?? "").toLowerCase().includes(q) ||
      (c.room ?? "").toLowerCase().includes(q) ||
      (c.building ?? "").toLowerCase().includes(q) ||
      (c.classGroup ?? "").toLowerCase().includes(q) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchSetColor = (color: string) => {
    void db.transaction("rw", db.courses, async () => {
      for (const id of selected) {
        const course = await db.courses.get(id);
        if (course) {
          await db.courses.put({ ...course, color, updatedAt: Date.now() });
        }
      }
    }).then(() => setSelected(new Set()));
  };

  const batchDelete = () => {
    const ids = [...selected];
    void deleteCoursesBatch(ids).then((snapshots) => {
      setSelected(new Set());
      if (snapshots.length === 0) return;
      useUndoStore.getState().push({
        id: `batch-${Date.now()}`,
        label: `已删除 ${snapshots.length} 门课程`,
        undo: async () => {
          const { restoreCourseSnapshot } = await import("@/core/db/courses");
          for (const snapshot of snapshots) {
            await restoreCourseSnapshot(snapshot);
          }
        },
      });
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="课程管理"
        description={`共 ${courses?.length ?? 0} 门课程 · 支持搜索与批量操作`}
        size="md"
        footer={
          selected.size > 0 ? (
            <>
              <span className="mr-auto text-sm text-muted-foreground">
                已选 {selected.size} 门
              </span>
              {COURSE_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={`批量改为${c.label}`}
                  aria-label={`批量改为${c.label}`}
                  onClick={() => batchSetColor(c.id)}
                  className="h-7 w-7 rounded-full border border-transparent transition-transform hover:scale-110"
                  style={{ background: `rgb(var(--course-${c.id}))` }}
                />
              ))}
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </Button>
            </>
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索课程名 / 教师 / 教室 / 标签 / 教学班"
                className="pl-9"
              />
            </div>
            {allTags.length > 0 ? (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                aria-label="按标签筛选"
                className="h-10 rounded-xl border bg-card px-2 text-sm outline-none"
              >
                <option value="">全部标签</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {courses?.length === 0 ? "本学期还没有课程" : "没有匹配的课程"}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((c) => {
                const dows = [...new Set(sessionsByCourse.get(c.id) ?? [])].sort(
                  (a, b) => a - b,
                );
                const checked = selected.has(c.id);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                      checked && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      aria-label={`选择 ${c.name}`}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ background: `rgb(var(--course-${c.color}))` }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {c.icon ? `${c.icon} ` : ""}
                        {c.name}
                        {c.classGroup ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            [{c.classGroup}]
                          </span>
                        ) : null}
                        {c.teacher ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {c.teacher}
                          </span>
                        ) : null}
                        {(c.tags ?? []).map((t) => (
                          <span
                            key={t}
                            className="ml-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dows.length > 0
                          ? dows.map((d) => `周${DAY_SHORT[d - 1]}`).join(" ")
                          : "无上课时间"}
                        {dows.length > 0 && sessions ? (
                          <span>
                            {" · "}
                            {[...(sessions ?? [])]
                              .filter((s) => s.courseId === c.id)
                              .slice(0, 1)
                              .map((s) => weekRuleLabel(s.weekRule))}
                            {([...(sessions ?? [])].filter((s) => s.courseId === c.id).length > 1
                              ? " 等"
                              : "")}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`编辑 ${c.name}`}
                      onClick={() => {
                        onClose();
                        onEditCourse(c.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="批量删除课程"
        message={`确定删除已选的 ${selected.size} 门课程及其全部上课安排？此操作不可恢复。`}
        confirmLabel="永久删除"
        danger
        onConfirm={batchDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
