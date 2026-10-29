import { create } from "zustand";

export type ScheduleView = "week" | "day" | "month" | "timeline" | "weeklist";

interface ScheduleState {
  /** 周视图 / 日视图 */
  view: ScheduleView;
  /** 当前查看的教学周；null = 跟随今天所在的教学周 */
  viewWeek: number | null;
  /** 日视图选中的星期（1-7）；null = 今天 */
  day: number | null;
  setView: (view: ScheduleView) => void;
  setWeek: (week: number | null) => void;
  setDay: (day: number | null) => void;
  reset: () => void;
}

/** 课表视图状态（不持久化，切学期时 reset）。 */
export const useScheduleStore = create<ScheduleState>()((set) => ({
  view: "week",
  viewWeek: null,
  day: null,
  setView: (view) => set({ view }),
  setWeek: (viewWeek) => set({ viewWeek }),
  setDay: (day) => set({ day }),
  reset: () => set({ view: "week", viewWeek: null, day: null }),
}));
