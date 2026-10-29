import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { db } from "@/core/db/dexie";
import { deleteException } from "@/core/db/courseExceptions";
import {
  EXCEPTION_KIND_LABELS,
  type CourseException,
  type Course,
} from "@/core/models";
import { formatShortDate } from "@/lib/date";

export interface ExceptionsListDialogProps {
  open: boolean;
  onClose: () => void;
  semesterId: string;
  onEdit: (exception: CourseException) => void;
}

function describe(e: CourseException): string {
  if (e.kind === "cancel") {
    return `${formatShortDate(e.originalDate)} 停课`;
  }
  if (e.kind === "adjust") {
    const changes = [
      e.newDate && e.newDate !== e.originalDate ? `调至 ${formatShortDate(e.newDate)}` : null,
      e.newStartSlot ? `第 ${e.newStartSlot}-${e.newEndSlot} 节` : null,
      e.newRoom ? `教室 ${e.newRoom}` : null,
      e.newTeacher ? `教师 ${e.newTeacher}` : null,
    ].filter(Boolean);
    return `${formatShortDate(e.originalDate)} → ${changes.join("，") || "已修改"}`;
  }
  return `补课 ${formatShortDate(e.date)} 第 ${e.startSlot}-${e.endSlot} 节`;
}

/** 调课记录：查看、编辑、撤销（删除）本学期全部课程变更。 */
export function ExceptionsListDialog({
  open,
  onClose,
  semesterId,
  onEdit,
}: ExceptionsListDialogProps) {
  const exceptions = useLiveQuery(
    () =>
      open
        ? db.courseExceptions
            .where("semesterId")
            .equals(semesterId)
            .toArray()
        : Promise.resolve([] as CourseException[]),
    [semesterId, open],
  );
  const courses = useLiveQuery(
    () =>
      open
        ? db.courses.where("semesterId").equals(semesterId).toArray()
        : Promise.resolve([] as Course[]),
    [semesterId, open],
  );
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const [deleting, setDeleting] = useState<CourseException | null>(null);

  const sorted = [...(exceptions ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="课程变更记录"
        description="停课、调课与补课都会留在这里；删除记录即恢复原课表"
        size="md"
      >
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            暂无变更记录。在课程详情中可以进行调课、停课、补课。
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((e) => {
              const course = courseById.get(e.courseId);
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          e.kind === "cancel"
                            ? "destructive"
                            : e.kind === "extra"
                              ? "accent"
                              : "default"
                        }
                      >
                        {EXCEPTION_KIND_LABELS[e.kind]}
                      </Badge>
                      <span className="text-sm font-medium">{course?.name ?? "未知课程"}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {describe(e)}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑变更"
                      onClick={() => {
                        onClose();
                        onEdit(e);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="撤销变更"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="撤销变更"
        message={
          deleting
            ? `撤销这条「${EXCEPTION_KIND_LABELS[deleting.kind]}」记录？课表将恢复为原始安排。`
            : ""
        }
        confirmLabel="撤销"
        onConfirm={() => {
          if (deleting) void deleteException(deleting.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
