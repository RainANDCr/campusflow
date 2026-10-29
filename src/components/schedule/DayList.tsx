import { MapPin, User } from "lucide-react";
import type { ClassTimeSlot } from "@/core/models";
import { getInstanceStatus, type CourseInstance } from "@/core/services/schedule";
import { freeSlotIndexes, groupConsecutive, slotsForDay } from "@/core/services/slots";
import { cn } from "@/lib/utils";
import { instanceStyle } from "./instanceStyle";

export interface DayListProps {
  instances: CourseInstance[];
  slots: ClassTimeSlot[];
  now: Date;
  onInstanceClick?: (inst: CourseInstance) => void;
}

/** 日视图：某一天的课程时间线（进行中高亮、已结束弱化）。 */
export function DayList({ instances, slots, now, onInstanceClick }: DayListProps) {
  const list = [...instances].sort(
    (a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot,
  );
  // 该天有效作息（不同星期可以有不同节次时间）
  const daySlots =
    instances[0] !== undefined
      ? slotsForDay(slots, instances[0].dayOfWeek)
      : slots;
  // 空课时段：有效作息中未被课程占用的连续节次
  const freeRanges = groupConsecutive(
    freeSlotIndexes(
      instances.filter((i) => i.variant !== "cancelled" && i.variant !== "moved-away"),
      daySlots,
    ),
  );

  if (list.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">这一天没有课程</p>
        </div>
        <FreeSlotsFooter ranges={freeRanges} allFree />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
      {list.map((inst) => {
        const status = getInstanceStatus(inst, now);
        const start = daySlots.find((s) => s.index === inst.startSlot);
        const end = daySlots.find((s) => s.index === inst.endSlot);
        return (
          <li key={inst.key}>
            <button
              type="button"
              onClick={() => onInstanceClick?.(inst)}
              className={cn(
                "flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition-transform active:scale-[0.99]",
                status === "ongoing" && "ring-2 ring-accent",
                status === "past" && "opacity-60 saturate-50",
                inst.variant === "cancelled" && "opacity-55",
                inst.variant === "moved-away" && "border-dashed opacity-50",
              )}
              style={instanceStyle(inst.color)}
            >
              <div className="w-14 shrink-0 text-center">
                <p className={cn("text-sm font-semibold tabular-nums", inst.variant === "cancelled" && "line-through")}>
                  {start?.startTime ?? "—"}
                </p>
                <p className="text-xs tabular-nums opacity-75">
                  {end?.endTime ?? ""}
                </p>
              </div>
              <div className="min-w-0 flex-1 border-l pl-3">
                <p className={cn("truncate text-sm font-semibold", inst.variant === "cancelled" && "line-through")}>
                  {inst.icon ? `${inst.icon} ` : ""}
                  {inst.variant === "moved-away" ? `${inst.courseName}（已调走）` : inst.courseName}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-85">
                  {inst.room ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[inst.building, inst.room].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  {inst.teacher ? (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {inst.teacher}
                    </span>
                  ) : null}
                  <span className="tabular-nums">
                    第 {inst.startSlot}-{inst.endSlot} 节
                  </span>
                </p>
              </div>
              {inst.variant === "adjusted" || inst.variant === "extra" ? (
                <span className="self-center rounded-full bg-current/15 px-2 py-0.5 text-[10px] font-medium">
                  {inst.variant === "adjusted" ? "已调整" : "补课"}
                </span>
              ) : null}
              {inst.variant === "cancelled" ? (
                <span className="self-center rounded-full bg-current/15 px-2 py-0.5 text-[10px] font-medium">
                  已停课
                </span>
              ) : null}
              {status === "ongoing" ? (
                <span className="self-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  进行中
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
      </ul>
      <FreeSlotsFooter ranges={freeRanges} />
    </div>
  );
}

/** 空课时段页脚：连续空闲节次区间。 */
function FreeSlotsFooter({
  ranges,
  allFree = false,
}: {
  ranges: Array<[number, number]>;
  allFree?: boolean;
}) {
  if (ranges.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">
        {allFree ? "全天空闲时段" : "空闲时段"}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ranges.map(([from, to]) => (
          <span
            key={`${from}-${to}`}
            className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground"
          >
            {from === to ? `第 ${from} 节` : `第 ${from}-${to} 节`}
          </span>
        ))}
      </div>
    </div>
  );
}
