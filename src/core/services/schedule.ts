import { format } from "date-fns";
import type {
  ClassTimeSlot,
  Course,
  CourseException,
  CourseSession,
  CourseType,
  ISODate,
} from "@/core/models";
import { dayOfWeekOf, toISODate } from "@/lib/date";
import { slotsForDay } from "./slots";
import { getDateForDay, type WeekLike } from "./weekCalc";
import { weekRuleContains } from "./weekRule";

/** 实例形态：正常 / 已停课 / 已调走（原时段占位） / 调整后 / 补课。 */
export type InstanceVariant =
  | "normal"
  | "cancelled"
  | "moved-away"
  | "adjusted"
  | "extra";

/** 一节课在具体某周的实例：课程 × 排课规则 × 周次 落到确定日期后的结果。 */
export interface CourseInstance {
  // CourseOccurrence 为共享规范中的标准命名，二者同构

  /** 稳定 key：sessionId@date（例外产生的实例为 exceptionId@date） */
  key: string;
  courseId: string;
  sessionId: string;
  courseName: string;
  color: string;
  icon?: string;
  type: CourseType;
  date: ISODate;
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
  /** 由节次配置推导的实际时间，节次缺失时为 undefined */
  startTime?: string;
  endTime?: string;
  teacher?: string;
  building?: string;
  room?: string;
  note?: string;
  variant: InstanceVariant;
  /** 关联的例外记录（调课/补课时用于追溯） */
  exceptionId?: string;
  exceptionNote?: string;
}

/** 共享规范中的标准实体名：CourseOccurrence ≡ CourseInstance（含 sourceSessionId/exceptionId 语义）。 */
export type CourseOccurrence = CourseInstance;

export interface ScheduleData {
  courses: Course[];
  sessions: CourseSession[];
  slots: ClassTimeSlot[];
}

export function getSlotTime(
  slots: ClassTimeSlot[],
  index: number,
  part: "start" | "end",
): string | undefined {
  const slot = slots.find((s) => s.index === index);
  return slot ? (part === "start" ? slot.startTime : slot.endTime) : undefined;
}

function makeInstance(
  session: CourseSession,
  course: Course,
  date: ISODate,
  slots: ClassTimeSlot[],
): CourseInstance {
  // 时间按“该天的有效作息”解析（支持不同星期不同作息）
  const daySlots = slotsForDay(slots, session.dayOfWeek);
  return {
    key: `${session.id}@${date}`,
    courseId: course.id,
    sessionId: session.id,
    courseName: course.name,
    color: course.color,
    icon: course.icon,
    type: course.type,
    date,
    dayOfWeek: session.dayOfWeek,
    startSlot: session.startSlot,
    endSlot: session.endSlot,
    startTime: getSlotTime(daySlots, session.startSlot, "start"),
    endTime: getSlotTime(daySlots, session.endSlot, "end"),
    teacher: session.teacher ?? course.teacher,
    building: session.building ?? course.building,
    room: session.room ?? course.room,
    note: session.note ?? course.note,
    variant: "normal",
  };
}

/**
 * 计算某教学周的全部课程实例。
 * 周次越界（假期）返回空数组；节次配置缺失时实例时间字段为空但照常展示。
 */
export function buildInstancesForWeek(
  semester: WeekLike & { totalWeeks: number },
  week: number,
  { courses, sessions, slots }: ScheduleData,
): CourseInstance[] {
  if (week < 1 || week > semester.totalWeeks) return [];
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const out: CourseInstance[] = [];
  for (const session of sessions) {
    if (!weekRuleContains(session.weekRule, week, semester.totalWeeks)) continue;
    const course = courseById.get(session.courseId);
    if (!course) continue;
    const date = getDateForDay(semester, week, session.dayOfWeek);
    out.push(makeInstance(session, course, date, slots));
  }
  return out.sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startSlot - b.startSlot,
  );
}

/** 某一天的实例（日期精确匹配）。 */
export function instancesForDate(
  instances: CourseInstance[],
  date: ISODate,
): CourseInstance[] {
  return instances
    .filter((i) => i.date === date)
    .sort((a, b) => a.startSlot - b.startSlot);
}

/**
 * 将调课/停课/补课例外应用到一周的实例上：
 * - 停课：原实例标记为 cancelled（卡片保留但划除）
 * - 调课：原地修改 → adjusted；跨日期 → 原位置 moved-away 占位、新位置 adjusted
 *   （原日期不在本周但新日期在本周时，新位置同样生成）
 * - 补课：在指定日期新增 extra 实例（不依赖重复规则，假期也可补课）
 */
export function applyExceptions(
  weekDates: ISODate[],
  base: CourseInstance[],
  exceptions: CourseException[],
  courseById: Map<string, Course>,
  slots: ClassTimeSlot[],
): CourseInstance[] {
  const dateSet = new Set(weekDates);
  const byKey = new Map(base.map((i) => [i.key, { ...i }]));
  const additions: CourseInstance[] = [];

  const applyFieldChanges = (
    inst: CourseInstance,
    e: Extract<CourseException, { kind: "adjust" }>,
  ) => {
    if (e.newStartSlot !== undefined) inst.startSlot = e.newStartSlot;
    if (e.newEndSlot !== undefined) inst.endSlot = e.newEndSlot;
    inst.startTime = getSlotTime(slots, inst.startSlot, "start");
    inst.endTime = getSlotTime(slots, inst.endSlot, "end");
    if (e.newBuilding !== undefined) inst.building = e.newBuilding;
    if (e.newRoom !== undefined) inst.room = e.newRoom;
    if (e.newTeacher !== undefined) inst.teacher = e.newTeacher;
    inst.variant = "adjusted";
    inst.exceptionId = e.id;
    inst.exceptionNote = e.note;
  };

  for (const e of exceptions) {
    if (e.kind === "cancel") {
      const inst = byKey.get(`${e.sessionId}@${e.originalDate}`);
      if (inst) {
        inst.variant = "cancelled";
        inst.exceptionId = e.id;
        inst.exceptionNote = e.note;
      }
    } else if (e.kind === "adjust") {
      const key = `${e.sessionId}@${e.originalDate}`;
      const inst = byKey.get(key);
      const targetDate = e.newDate ?? e.originalDate;
      if (inst) {
        if (targetDate === e.originalDate) {
          applyFieldChanges(inst, e);
        } else {
          inst.variant = "moved-away";
          inst.exceptionId = e.id;
          inst.exceptionNote = e.note ?? `已调至 ${targetDate}`;
          const moved: CourseInstance = {
            ...inst,
            key: `${e.id}@${targetDate}`,
            date: targetDate,
            dayOfWeek: dayOfWeekNumberOf(targetDate),
          };
          applyFieldChanges(moved, e);
          moved.exceptionNote = e.note;
          if (dateSet.has(targetDate)) additions.push(moved);
        }
      } else if (dateSet.has(targetDate)) {
        // 原日期不在本周，但调整目标落在本周：从课程信息构建
        const course = courseById.get(e.courseId);
        if (!course) continue;
        const moved: CourseInstance = {
          key: `${e.id}@${targetDate}`,
          courseId: course.id,
          sessionId: e.sessionId,
          courseName: course.name,
          color: course.color,
          icon: course.icon,
          type: course.type,
          date: targetDate,
          dayOfWeek: dayOfWeekNumberOf(targetDate),
          startSlot: e.newStartSlot ?? 1,
          endSlot: e.newEndSlot ?? e.newStartSlot ?? 1,
          startTime: undefined,
          endTime: undefined,
          teacher: e.newTeacher ?? course.teacher,
          building: e.newBuilding ?? course.building,
          room: e.newRoom ?? course.room,
          note: undefined,
          variant: "adjusted",
          exceptionId: e.id,
          exceptionNote: e.note,
        };
        moved.startTime = getSlotTime(slots, moved.startSlot, "start");
        moved.endTime = getSlotTime(slots, moved.endSlot, "end");
        additions.push(moved);
      }
    } else {
      // extra（补课）
      if (!dateSet.has(e.date)) continue;
      const course = courseById.get(e.courseId);
      if (!course) continue;
      additions.push({
        key: `${e.id}@${e.date}`,
        courseId: course.id,
        sessionId: "",
        courseName: course.name,
        color: course.color,
        icon: course.icon,
        type: course.type,
        date: e.date,
        dayOfWeek: dayOfWeekNumberOf(e.date),
        startSlot: e.startSlot,
        endSlot: e.endSlot,
        startTime: getSlotTime(slots, e.startSlot, "start"),
        endTime: getSlotTime(slots, e.endSlot, "end"),
        teacher: e.teacher ?? course.teacher,
        building: e.building ?? course.building,
        room: e.room ?? course.room,
        note: e.note,
        variant: "extra",
        exceptionId: e.id,
        exceptionNote: e.note,
      });
    }
  }

  return [...byKey.values(), ...additions].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startSlot - b.startSlot,
  );
}

/** ISO 日期 → ISO 星期（1=周一…7=周日）。 */
function dayOfWeekNumberOf(date: ISODate): number {
  return dayOfWeekOf(date);
}

/**
 * 重叠课程分道：同一时段并排显示，先后衔接则共用一列。
 * 返回与输入同序的 lane 编号数组及所需道数。
 */
export function assignLanes(
  items: Array<{ startSlot: number; endSlot: number }>,
): { lanes: number[]; laneCount: number } {
  const order = items
    .map((it, index) => ({ ...it, index }))
    .sort(
      (a, b) => a.startSlot - b.startSlot || b.endSlot - a.endSlot,
    );
  const laneEnds: number[] = [];
  const lanes = new Array<number>(items.length).fill(0);
  for (const it of order) {
    let lane = laneEnds.findIndex((end) => it.startSlot > end);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endSlot);
    } else {
      laneEnds[lane] = it.endSlot;
    }
    lanes[it.index] = lane;
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

export type InstanceStatus = "past" | "ongoing" | "upcoming";

/** 按当前时间判断课程状态；缺少时间信息返回 null。 */
export function getInstanceStatus(
  inst: Pick<CourseInstance, "date" | "startTime" | "endTime">,
  now: Date,
): InstanceStatus | null {
  if (!inst.startTime || !inst.endTime) return null;
  const today = toISODate(now);
  if (inst.date < today) return "past";
  if (inst.date > today) return "upcoming";
  const current = format(now, "HH:mm");
  if (current < inst.startTime) return "upcoming";
  if (current >= inst.endTime) return "past";
  return "ongoing";
}
