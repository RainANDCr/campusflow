import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CourseInstance, } from "@/core/services/schedule";
import type { ClassTimeSlot, Semester } from "@/core/models";
import { renderTimetablePng } from "@/core/services/timetablePng";
import { downloadBlob } from "@/lib/download";
import { formatWeekRange } from "@/core/services/weekCalc";

export interface ExportPngDialogProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
  week: number;
  weekDates: string[];
  slots: ClassTimeSlot[];
  instances: CourseInstance[];
  showWeekend: boolean;
  todayDow: number | null;
}

/**
 * 课表截图导出（模块 02 #25）：分享前可隐藏教室/教师/时间等个人字段，隐私最小化。
 */
export function ExportPngDialog({
  open,
  onClose,
  semester,
  week,
  weekDates,
  slots,
  instances,
  showWeekend,
  todayDow,
}: ExportPngDialogProps) {
  const [hideRoom, setHideRoom] = useState(false);
  const [hideTeacher, setHideTeacher] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const stripped: CourseInstance[] = instances.map((inst) => ({
        ...inst,
        room: hideRoom ? undefined : inst.room,
        building: hideRoom ? undefined : inst.building,
        teacher: hideTeacher ? undefined : inst.teacher,
      }));
      const blob = await renderTimetablePng({
        semester,
        week,
        weekLabel: `第 ${week} 周`,
        dateRange: formatWeekRange(weekDates),
        slots,
        instances: stripped,
        showWeekend,
        todayDow,
      });
      downloadBlob(`${semester.name}-第${week}周${hideRoom || hideTeacher ? "-脱敏" : ""}.png`, blob);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="导出课表图片"
      description={`第 ${week} 周 · 分享前可选择隐藏个人信息`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void doExport()} disabled={busy}>
            {busy ? "生成中…" : "导出 PNG"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          导出内容：{semester.name} · 第 {week} 周 · {slots.length} 节作息 ·{" "}
          {instances.filter((i) => i.variant !== "moved-away").length} 个课次
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideRoom}
            onChange={(e) => setHideRoom(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          隐藏教学楼与教室
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideTeacher}
            onChange={(e) => setHideTeacher(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          隐藏教师姓名
        </label>
        <p className="text-xs text-muted-foreground">
          隐私优先：勾选后图片中不包含对应字段，文件名也会标注「脱敏」。
        </p>
      </div>
    </Dialog>
  );
}
