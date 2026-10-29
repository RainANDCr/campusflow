import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { CourseInstance } from "@/core/services/schedule";
import { cn } from "@/lib/utils";
import { instanceStyle } from "./instanceStyle";

export interface WeekListViewProps {
  /** 按该周展示顺序排列的日期（与 dayOrder 对齐） */
  days: Array<{ date: string; label: string; dayOfWeek: number }>;
  instances: CourseInstance[];
  /** 默认展开的日期（如今天） */
  defaultExpandedDate?: string;
  onInstanceClick?: (inst: CourseInstance) => void;
}

/**
 * 每周课程列表（模块 02 #3 + 精简视图 #6）：
 * 按星期聚合的紧凑列表，支持折叠/展开；行只保留时间/名称/地点核心信息。
 */
export function WeekListView({
  days,
  instances,
  defaultExpandedDate,
  onInstanceClick,
}: WeekListViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedDate ? [defaultExpandedDate] : []),
  );

  const toggle = (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const list = instances
          .filter((i) => i.date === day.date && i.variant !== "moved-away")
          .sort((a, b) => a.startSlot - b.startSlot);
        const isOpen = expanded.has(day.date);
        const activeCount = list.filter(
          (i) => i.variant !== "cancelled",
        ).length;
        return (
          <div key={day.date} className="overflow-hidden rounded-2xl border bg-card">
            <button
              type="button"
              onClick={() => toggle(day.date)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                {day.label}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {activeCount > 0 ? `${activeCount} 门课` : "无课"}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {day.date.slice(5).replace("-", "/")}
              </span>
            </button>
            {isOpen ? (
              list.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-muted-foreground">休息，没有安排</p>
              ) : (
                <ul className="space-y-1 px-2 pb-2">
                  {list.map((inst) => (
                    <li key={inst.key}>
                      <button
                        type="button"
                        onClick={() => onInstanceClick?.(inst)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-transform active:scale-[0.99]",
                          inst.variant === "cancelled" && "opacity-50",
                        )}
                        style={instanceStyle(inst.color)}
                      >
                        <span className={cn("w-20 shrink-0 tabular-nums", inst.variant === "cancelled" && "line-through")}>
                          {inst.startTime ?? `第${inst.startSlot}节`}
                          {inst.endTime ? `-${inst.endTime.slice(0, 5)}` : ""}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate font-medium", inst.variant === "cancelled" && "line-through")}>
                          {inst.courseName}
                        </span>
                        {inst.room ? (
                          <span className="shrink-0 opacity-75">@{inst.room}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
