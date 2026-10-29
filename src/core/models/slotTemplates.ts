/** 学校作息时间模板（模块 20 #7）：一键套用到节次编辑器。 */
export interface SlotTemplate {
  id: string;
  name: string;
  description: string;
  slots: Array<{ startTime: string; endTime: string }>;
}

export const SLOT_TEMPLATES: SlotTemplate[] = [
  {
    id: "standard12",
    name: "常规 12 节",
    description: "8:00 起每两节一单元，晚间两节（最常见）",
    slots: [
      { startTime: "08:00", endTime: "08:45" },
      { startTime: "08:55", endTime: "09:40" },
      { startTime: "10:00", endTime: "10:45" },
      { startTime: "10:55", endTime: "11:40" },
      { startTime: "12:00", endTime: "12:45" },
      { startTime: "12:55", endTime: "13:40" },
      { startTime: "14:00", endTime: "14:45" },
      { startTime: "14:55", endTime: "15:40" },
      { startTime: "16:00", endTime: "16:45" },
      { startTime: "16:55", endTime: "17:40" },
      { startTime: "19:00", endTime: "19:45" },
      { startTime: "19:55", endTime: "20:40" },
    ],
  },
  {
    id: "compact8",
    name: "紧凑 8 节",
    description: "无午休连排，适合小学期/实训周",
    slots: [
      { startTime: "08:00", endTime: "08:45" },
      { startTime: "08:50", endTime: "09:35" },
      { startTime: "09:45", endTime: "10:30" },
      { startTime: "10:35", endTime: "11:20" },
      { startTime: "11:25", endTime: "12:10" },
      { startTime: "13:30", endTime: "14:15" },
      { startTime: "14:20", endTime: "15:05" },
      { startTime: "15:15", endTime: "16:00" },
    ],
  },
  {
    id: "evening14",
    name: "含晚自习 14 节",
    description: "白天 10 节 + 晚自习 4 节",
    slots: [
      { startTime: "08:00", endTime: "08:45" },
      { startTime: "08:55", endTime: "09:40" },
      { startTime: "10:00", endTime: "10:45" },
      { startTime: "10:55", endTime: "11:40" },
      { startTime: "12:00", endTime: "12:45" },
      { startTime: "12:55", endTime: "13:40" },
      { startTime: "14:30", endTime: "15:15" },
      { startTime: "15:25", endTime: "16:10" },
      { startTime: "16:20", endTime: "17:05" },
      { startTime: "17:15", endTime: "18:00" },
      { startTime: "18:30", endTime: "19:15" },
      { startTime: "19:25", endTime: "20:10" },
      { startTime: "20:20", endTime: "21:05" },
      { startTime: "21:15", endTime: "22:00" },
    ],
  },
];
