import { BellRing, Clock } from "lucide-react";
import type { CourseInstance } from "@/core/services/schedule";
import { getInstanceStatus } from "@/core/services/schedule";
import { cn } from "@/lib/utils";

export interface NextClassCardProps {
  /** 今天的全部课程实例（已含调课例外） */
  todayInstances: CourseInstance[];
  now: Date;
}

function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 1) return "不到 1 分钟";
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

/** 下节课倒计时卡片：当前课程 / 下节课 / 今日剩余节数。 */
export function NextClassCard({ todayInstances, now }: NextClassCardProps) {
  const active = todayInstances.filter(
    (i) => i.variant !== "cancelled" && i.variant !== "moved-away",
  );
  const ongoing = active.find((i) => getInstanceStatus(i, now) === "ongoing");
  const upcoming = active
    .filter((i) => getInstanceStatus(i, now) === "upcoming")
    .sort((a, b) => a.startSlot - b.startSlot);
  const next = ongoing ?? upcoming[0];
  const remainingCount = ongoing ? upcoming.length : upcoming.length;

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
        <BellRing className="h-5 w-5" />
      </div>
      {next ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {ongoing ? "正在进行" : "下节课"}：{next.courseName}
            {next.room ? (
              <span className="font-normal text-muted-foreground"> · {next.room}</span>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {ongoing
              ? `距下课还有 ${formatRemaining(
                  new Date(`${next.date}T${next.endTime ?? "00:00"}:00`).getTime() - now.getTime(),
                )}`
              : next.startTime
                ? `${next.startTime} 开课 · 还有 ${formatRemaining(
                    new Date(`${next.date}T${next.startTime}:00`).getTime() - now.getTime(),
                  )}`
                : `第 ${next.startSlot} 节开课`}
          </p>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">今天没有更多课程</p>
          <p className="mt-0.5 text-xs text-muted-foreground">好好休息一下吧</p>
        </div>
      )}
      <div className={cn("shrink-0 text-right")}>
        <p className="text-lg font-semibold tabular-nums">{remainingCount}</p>
        <p className="text-[10px] text-muted-foreground">今日剩余</p>
      </div>
    </div>
  );
}
