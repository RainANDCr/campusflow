import type { ClassTimeSlot, Semester } from "@/core/models";
import { assignLanes, getInstanceStatus, instancesForDate, type CourseInstance } from "@/core/services/schedule";
import { baseSlots, breaksIn, slotsForDay } from "@/core/services/slots";
import { getDateForDay, orderedDaysOfWeek } from "@/core/services/weekCalc";
import { useLongPress } from "@/hooks/useLongPress";
import { formatShortDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { instanceStyle } from "./instanceStyle";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 行高按信息密度档位（模块 02 #19）。 */
export const ROW_HEIGHTS = { compact: 44, standard: 56, relaxed: 72 } as const;
export type CardDensity = keyof typeof ROW_HEIGHTS;

export interface WeekGridProps {
  semester: Semester;
  week: number;
  slots: ClassTimeSlot[];
  instances: CourseInstance[];
  showWeekend: boolean;
  /** 今天是否在本查看周内（1-7），不在则为 null */
  todayDow: number | null;
  now: Date;
  /** 卡片信息显示配置（模块 02 #24） */
  cardFields?: { room: boolean; teacher: boolean; time: boolean };
  density?: CardDensity;
  onEmptySlotClick?: (dayOfWeek: number, slotIndex: number) => void;
  onInstanceClick?: (inst: CourseInstance) => void;
  /** 长按 / 右键快捷菜单（模块 02 #17） */
  onCardMenu?: (inst: CourseInstance, pos: { x: number; y: number }) => void;
  /** 拖拽调课确认回调（模块 02 #18）：落到目标星期与起始节次（保留原时长） */
  onCardDrop?: (inst: CourseInstance, dayOfWeek: number, startSlot: number) => void;
}

/**
 * 网格式周课表：左侧节次时间列 + 按星期排列的课程列。
 * 课程卡跨节次绝对定位；同一时段重叠的课程自动分道并排。
 * 点击空白格新建课程，点击课程卡查看详情。
 */
export function WeekGrid({
  semester,
  week,
  slots,
  instances,
  showWeekend,
  todayDow,
  now,
  cardFields,
  density = "standard",
  onEmptySlotClick,
  onInstanceClick,
  onCardMenu,
  onCardDrop,
}: WeekGridProps) {
  const ROW_H = ROW_HEIGHTS[density];
  const days = orderedDaysOfWeek(semester.weekStartsOn).filter(
    (d) => showWeekend || d <= 5,
  );
  // 行 = 全部作息中出现的节次序号（通用 + 各专属作息的并集）
  const base = baseSlots(slots);
  const maxIndex = Math.max(1, ...slots.map((s) => s.index));
  const rowIndexes = Array.from({ length: maxIndex }, (_, i) => i + 1);
  const rowLabel = (idx: number): { name: string; time?: string } => {
    const s = base.find((x) => x.index === idx) ?? slots.find((x) => x.index === idx);
    return s ? { name: s.name ?? `第${idx}节`, time: s.startTime } : { name: `第${idx}节` };
  };
  const baseBreaks = breaksIn(base);
  const slotCount = maxIndex;
  const gridHeight = slotCount * ROW_H;

  // ===== 拖拽调课（模块 02 #18，仅鼠标；移动端用长按菜单）=====
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    inst: CourseInstance;
    x: number;
    y: number;
    dow: number | null;
    slot: number | null;
  } | null>(null);

  const dragMove = (clientX: number, clientY: number) => {
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const slot = Math.min(
      slotCount,
      Math.max(1, Math.floor((clientY - rect.top) / ROW_H) + 1),
    );
    const el = document.elementFromPoint(clientX, clientY);
    const col = el?.closest("[data-dow]");
    const dow = col ? Number(col.getAttribute("data-dow")) : null;
    setDrag((d) => (d ? { ...d, x: clientX, y: clientY, dow, slot } : d));
  };

  const dragEnd = () => {
    setDrag((d) => {
      if (d && d.dow && d.slot && onCardDrop) {
        onCardDrop(d.inst, d.dow, d.slot);
      }
      return null;
    });
  };

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <div className="min-w-max">
        {/* 星期表头 */}
        <div className="flex border-b">
          <div className="w-12 shrink-0" />
          {days.map((dow) => {
            const isToday = todayDow === dow;
            return (
              <div
                key={dow}
                className={cn(
                  "flex-1 basis-20 px-1 py-2 text-center",
                  isToday && "bg-primary/8",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {DAY_LABELS[dow - 1]}
                </p>
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isToday && "text-primary",
                  )}
                >
                  {formatShortDate(getDateForDay(semester, week, dow))}
                </p>
              </div>
            );
          })}
        </div>

        {/* 主体：时间列 + 各天课程列 */}
        <div className="flex" ref={bodyRef}>
          <div className="w-12 shrink-0" style={{ height: gridHeight }}>
            {rowIndexes.map((idx) => {
              const label = rowLabel(idx);
              const breakMin = baseBreaks.find((b) => b.afterIndex === idx)?.minutes;
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center justify-center border-b text-center"
                  style={{ height: ROW_H }}
                >
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {label.name}
                  </span>
                  {label.time ? (
                    <span className="text-[9px] tabular-nums text-muted-foreground/70">
                      {label.time}
                    </span>
                  ) : null}
                  {breakMin ? (
                    <span className="text-[8px] text-muted-foreground/50">
                      课间{breakMin}′
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {days.map((dow) => {
            const date = getDateForDay(semester, week, dow);
            const dayInstances = instancesForDate(instances, date);
            const { lanes, laneCount } = assignLanes(dayInstances);
            const effective = slotsForDay(slots, dow);
            const effectiveIdx = new Set(effective.map((s) => s.index));
            const isToday = todayDow === dow;
            return (
              <div
                key={dow}
                data-dow={dow}
                className={cn(
                  "relative flex-1 basis-20 border-l",
                  isToday && "bg-primary/8",
                )}
                style={{ height: gridHeight }}
              >
                {/* 空白格：该天有效节次可点击新建；专属作息未覆盖的行置灰禁用 */}
                {rowIndexes.map((idx, i) =>
                  effectiveIdx.has(idx) ? (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`周${DAY_LABELS[dow - 1]}第${idx}节添加课程`}
                      onClick={() => onEmptySlotClick?.(dow, idx)}
                      className="absolute inset-x-0 border-b border-dashed border-border/60 transition-colors hover:bg-muted/50"
                      style={{ top: i * ROW_H, height: ROW_H }}
                    />
                  ) : (
                    <div
                      key={idx}
                      aria-hidden
                      className="absolute inset-x-0 border-b border-border/40 bg-muted/40"
                      style={{ top: i * ROW_H, height: ROW_H }}
                    />
                  ),
                )}

                {/* 课程卡片 */}
                {dayInstances.map((inst, i) => {
                  const lane = lanes[i] ?? 0;
                  const laneW = 100 / laneCount;
                  const status = getInstanceStatus(inst, now);
                  return (
                    <GridCard
                      key={inst.key}
                      inst={inst}
                      status={status}
                      style={{
                        top: (inst.startSlot - 1) * ROW_H + 2,
                        height: (inst.endSlot - inst.startSlot + 1) * ROW_H - 4,
                        left: `calc(${lane * laneW}% + 2px)`,
                        width: `calc(${laneW}% - 4px)`,
                        ...instanceStyle(inst.color),
                      }}
                      title={`${inst.courseName}${inst.room ? ` @${inst.room}` : ""}${
                        inst.variant === "moved-away" ? "（已调走）" : ""
                      }`}
                      cardFields={cardFields}
                      bigCard={inst.endSlot - inst.startSlot + 1 >= 3}
                      onInstanceClick={onInstanceClick}
                      onCardMenu={onCardMenu}
                      onDragStart={(inst) => setDrag({ inst, x: 0, y: 0, dow: null, slot: null })}
                      onDragMove={dragMove}
                      onDragEnd={dragEnd}
                      dragging={drag?.inst.key === inst.key}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* 拖拽幽灵预览 */}
          {drag && drag.dow && drag.slot ? (
            <div
              className="pointer-events-none fixed z-50 rounded-lg border-2 border-dashed border-accent bg-accent/10 px-3 py-2 text-xs font-medium text-accent-foreground shadow-lg"
              style={{ left: drag.x + 12, top: drag.y + 12 }}
            >
              移至 {DAY_LABELS[drag.dow - 1]} 第 {drag.slot} 节（松开确认调课）
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface GridCardProps {
  inst: CourseInstance;
  status: ReturnType<typeof getInstanceStatus>;
  style: React.CSSProperties;
  title: string;
  cardFields?: { room: boolean; teacher: boolean; time: boolean };
  bigCard: boolean;
  onInstanceClick?: (inst: CourseInstance) => void;
  onCardMenu?: (inst: CourseInstance, pos: { x: number; y: number }) => void;
  onDragStart?: (inst: CourseInstance) => void;
  onDragMove?: (clientX: number, clientY: number) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}

/** 单张课表卡片：点击进详情；触摸长按 / 鼠标右键菜单；鼠标拖拽调课（#18）。 */
function GridCard({
  inst,
  status,
  style,
  title,
  cardFields,
  bigCard,
  onInstanceClick,
  onCardMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
  dragging = false,
}: GridCardProps) {
  const longPress = useLongPress((pos) => onCardMenu?.(inst, pos));
  const showRoom = cardFields?.room ?? true;
  const showTeacher = cardFields?.teacher ?? true;
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragActive = useRef(false);

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    dragActive.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragOrigin.current) return;
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    if (!dragActive.current && Math.hypot(dx, dy) > 6) {
      dragActive.current = true;
      onDragStart?.(inst);
    }
    if (dragActive.current) onDragMove?.(e.clientX, e.clientY);
  };
  const handlePointerUp = () => {
    if (dragActive.current) onDragEnd?.();
    dragOrigin.current = null;
    dragActive.current = false;
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (dragging) return; // 拖拽结束的同一 tick 内抑制误触点击
        onInstanceClick?.(inst);
      }}
      {...longPress}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        if (!onCardMenu) return;
        e.preventDefault();
        onCardMenu(inst, { x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "absolute overflow-hidden rounded-lg border p-1.5 text-left transition-transform active:scale-[0.98]",
        status === "ongoing" && "z-10 ring-2 ring-accent",
        status === "past" && "opacity-55 saturate-50",
        inst.variant === "cancelled" && "line-through opacity-50",
        inst.variant === "moved-away" && "border-dashed opacity-45",
        dragging && "opacity-40 ring-2 ring-accent",
      )}
      style={style}
      title={title}
    >
      <p className="line-clamp-2 text-[11px] font-semibold leading-tight">
        {inst.icon ? `${inst.icon} ` : ""}
        {inst.variant === "moved-away" ? "已调走" : inst.courseName}
      </p>
      {showRoom && inst.room && inst.variant !== "moved-away" ? (
        <p className="mt-0.5 truncate text-[10px] opacity-80">@{inst.room}</p>
      ) : null}
      {showTeacher && bigCard && inst.teacher ? (
        <p className="mt-0.5 truncate text-[10px] opacity-70">{inst.teacher}</p>
      ) : null}
      {inst.variant === "adjusted" || inst.variant === "extra" ? (
        <span className="absolute right-1 top-1 rounded bg-current/15 px-1 text-[9px] font-medium">
          {inst.variant === "adjusted" ? "调" : "补"}
        </span>
      ) : null}
    </button>
  );
}
