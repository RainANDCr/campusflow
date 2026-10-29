import { useLiveQuery } from "dexie-react-hooks";
import { Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db } from "@/core/db/dexie";
import type { Course, CourseSession, Semester } from "@/core/models";
import { weekRuleLabel } from "@/core/services/weekRule";
import { formatShortDate } from "@/lib/date";
import { instanceStyle } from "@/components/schedule/instanceStyle";

const DAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];

export interface ArchiveCoursesDialogProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
}

/**
 * 历史学期课程查询（模块 01 #23）：只读查看归档学期的课程与安排，
 * 支持按课程名 / 教师 / 教室 / 标签 / 教学班搜索。不可编辑。
 */
export function ArchiveCoursesDialog({
  open,
  onClose,
  semester,
}: ArchiveCoursesDialogProps) {
  const [query, setQuery] = useState("");

  const courses = useLiveQuery(
    () =>
      open
        ? db.courses
            .where("semesterId")
            .equals(semester.id)
            .toArray()
            .then((list) => list.sort((a, b) => a.order - b.order))
        : Promise.resolve([] as Course[]),
    [semester.id, open],
  );
  const sessions = useLiveQuery(
    () =>
      open
        ? db.courseSessions.where("semesterId").equals(semester.id).toArray()
        : Promise.resolve([] as CourseSession[]),
    [semester.id, open],
  );

  const q = query.trim().toLowerCase();
  const filtered = (courses ?? []).filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.teacher ?? "").toLowerCase().includes(q) ||
      (c.room ?? "").toLowerCase().includes(q) ||
      (c.classGroup ?? "").toLowerCase().includes(q) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`历史课程 · ${semester.name}`}
      description="归档学期为只读视图；如需修改请先在学期页取消归档"
      size="md"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索课程名 / 教师 / 教室 / 标签 / 教学班"
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {(courses ?? []).length === 0 ? "该学期没有课程" : "没有匹配的课程"}
          </p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {filtered.map((c) => {
              const cSessions = (sessions ?? []).filter((s) => s.courseId === c.id);
              return (
                <li key={c.id} className="rounded-xl border p-3">
                  <div
                    className="rounded-lg px-3 py-2"
                    style={instanceStyle(c.color)}
                  >
                    <p className="text-sm font-semibold">
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                      {c.classGroup ? (
                        <span className="ml-1.5 font-normal opacity-80">[{c.classGroup}]</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs opacity-85">
                      {c.teacher || "教师未填"}
                      {c.room ? ` · ${[c.building, c.room].filter(Boolean).join(" ")}` : ""}
                    </p>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 px-1 text-xs text-muted-foreground">
                    {cSessions.length === 0 ? (
                      <li>无上课安排</li>
                    ) : (
                      cSessions.map((s) => (
                        <li key={s.id}>
                          周{DAY_SHORT[s.dayOfWeek - 1]} 第 {s.startSlot}-{s.endSlot} 节 ·{" "}
                          {weekRuleLabel(s.weekRule)}
                          {s.room ? ` · ${s.room}` : ""}
                        </li>
                      ))
                    )}
                  </ul>
                  {(c.tags ?? []).length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          学期范围：{formatShortDate(semester.weekOneAnchor)} 起 {semester.totalWeeks} 教学周
        </p>
      </div>
    </Dialog>
  );
}
