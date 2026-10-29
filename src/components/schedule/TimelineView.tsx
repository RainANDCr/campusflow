import type { ClassTimeSlot } from "@/core/models";
import { getInstanceStatus, type CourseInstance } from "@/core/services/schedule";
import { slotsForDay } from "@/core/services/slots";
import { cn } from "@/lib/utils";
import { instanceStyle } from "./instanceStyle";

export interface TimelineViewProps {
  date: string;
  instances: CourseInstance[];
  slots: ClassTimeSlot[];
  now: Date;
  onInstanceClick?: (inst: CourseInstance) => void;
}

const PX_PER_MIN = 1.1;

/** 时间轴视图（模块 02 #5）：按真实时刻排布，体现不等长课程、空闲区间与当前时刻线。 */
export function TimelineView({ date, instances, slots, now, onInstanceClick }: TimelineViewProps) {
  const dayOfWeek = instances[0]?.dayOfWeek ?? 1;
  const daySlots = slotsForDay(slots, dayOfWeek);

  // 展示窗口：该天最早开始前 30 分钟 ~ 最晚结束后 30 分钟；无作息时 8:00-18:00
  const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let startMin = daySlots.length > 0 ? minutesOf(daySlots[0]?.startTime ?? "08:00") : 8 * 60;
  let endMin = daySlots.length > 0 ? minutesOf(daySlots[daySlots.length - 1]?.endTime ?? "18:00") : 18 * 60;
  for (const inst of instances) {
    if (!inst.startTime || !inst.endTime) continue;
    startMin = Math.min(startMin, minutesOf(inst.startTime));
    endMin = Math.max(endMin, minutesOf(inst.endTime));
  }
  startMin -= 30;
  endMin += 30;
  const windowMin = Math.max(60, endMin - startMin);
  const height = windowMin * PX_PER_MIN;

  const y = (t: string) => (minutesOf(t) - startMin) * PX_PER_MIN;
  const isToday = date === toISODateLocal(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowY = nowMinutes - startMin;
  const showNowLine = isToday && nowY >= 0 && nowY <= windowMin;

  const hourTicks: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hourTicks.push(m);

  const timed = instances.filter(
    (i) => i.startTime && i.endTime && i.variant !== "moved-away",
  );

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="relative" style={{ height }}>
        {/* 小时刻度 */}
        {hourTicks.map((m) => (
          <div
            key={m}
            className="pointer-events-none absolute inset-x-0 flex items-start gap-2"
            style={{ top: (m - startMin) * PX_PER_MIN }}
          >
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
              {String(Math.floor(m / 60)).padStart(2, "0")}:00
            </span>
            <span className="mt-1.5 h-px flex-1 bg-border/60" />
          </div>
        ))}

        {/* 当前时刻线 */}
        {showNowLine ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
            style={{ top: nowY }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
            <span className="h-px flex-1 bg-destructive/60" />
          </div>
        ) : null}

        {/* 课程块（按真实时刻定位） */}
        {timed.map((inst) => {
          const status = getInstanceStatus(inst, now);
          const top = y(inst.startTime ?? "08:00");
          const bottom = y(inst.endTime ?? "08:45");
          return (
            <button
              key={inst.key}
              type="button"
              onClick={() => onInstanceClick?.(inst)}
              className={cn(
                "absolute left-12 right-2 overflow-hidden rounded-lg border p-2 text-left transition-transform active:scale-[0.99]",
                status === "ongoing" && "z-10 ring-2 ring-accent",
                status === "past" && "opacity-55 saturate-50",
                inst.variant === "cancelled" && "opacity-50",
              )}
              style={{
                top,
                height: Math.max(30, bottom - top - 4),
                ...instanceStyle(inst.color),
              }}
            >
              <p className={cn("truncate text-xs font-semibold", inst.variant === "cancelled" && "line-through")}>
                {inst.icon ? `${inst.icon} ` : ""}
                {inst.courseName}
              </p>
              <p className="text-[10px] tabular-nums opacity-80">
                {inst.startTime} - {inst.endTime}
                {inst.room ? ` · ${inst.room}` : ""}
                {status === "ongoing" ? " · 进行中" : ""}
              </p>
            </button>
          );
        })}

        {timed.length === 0 ? (
          <p className="absolute left-1/2 top-1/3 -translate-x-1/2 text-sm text-muted-foreground">
            该时段没有课程
          </p>
        ) : null}
      </div>
    </div>
  );
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
