import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ScheduleView } from "@/stores/scheduleStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WeekSwitcherProps {
  /** 展示文案，如 "第 3 周 · 9.14 - 9.20" */
  label: string;
  /** 是否处于假期（无法点击上/下周到越界位置时由父组件限制） */
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** 回到本周；非教学周时为 null 不显示 */
  onBackToCurrent?: () => void;
  showBackToCurrent: boolean;
}

/** 周次切换器：上一周 / 下一周 / 回到本周。 */
export function WeekSwitcher({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onBackToCurrent,
  showBackToCurrent,
}: WeekSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border bg-card">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="上一周"
          className="rounded-l-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-36 px-2 text-center text-sm font-medium tabular-nums">
          {label}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="下一周"
          className="rounded-r-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {showBackToCurrent && onBackToCurrent ? (
        <Button variant="outline" size="sm" onClick={onBackToCurrent}>
          回到本周
        </Button>
      ) : null}
    </div>
  );
}

/** 视图切换（周 / 日 / 月 / 时间轴 / 周列表）。 */
export function ViewToggle({
  view,
  onChange,
  className,
}: {
  view: "week" | "day" | "month" | "timeline" | "weeklist";
  onChange: (v: "week" | "day" | "month" | "timeline" | "weeklist") => void;
  className?: string;
}) {
  const items: Array<[ScheduleView, string]> = [
    ["week", "周"],
    ["day", "日"],
    ["month", "月"],
    ["timeline", "轴"],
    ["weeklist", "列"],
  ];
  return (
    <div className={cn("inline-flex rounded-xl bg-muted p-1", className)} role="tablist" aria-label="课表视图">
      {items.map(([value, text]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          title={{ week: "周视图", day: "日视图", month: "月历", timeline: "时间轴", weeklist: "周列表" }[value]}
          onClick={() => onChange(value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            view === value ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
