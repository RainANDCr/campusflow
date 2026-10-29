import { describe, expect, it } from "vitest";
import type { ClassTimeSlot, Course, CourseSession, Semester } from "@/core/models";
import { commonFreeRanges, personalFreeRanges, recommendMeetingSlot } from "./freeTime";

const semester: Semester = {
  id: "s1", name: "S", startDate: "2026-08-31", weekOneAnchor: "2026-08-31",
  totalWeeks: 20, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
};

const slots: ClassTimeSlot[] = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
  { id: "t3", semesterId: "s1", index: 3, startTime: "10:00", endTime: "10:45", createdAt: 0, updatedAt: 0 },
  { id: "t4", semesterId: "s1", index: 4, startTime: "10:55", endTime: "11:40", createdAt: 0, updatedAt: 0 },
];

const me: Course = { id: "c1", semesterId: "s1", name: "我的早课", type: "lecture", color: "sky", order: 0, createdAt: 0, updatedAt: 0 };
const friend: Course = { id: "f1", semesterId: "s1", name: "朋友早课", type: "lecture", color: "rose", order: 0, createdAt: 0, updatedAt: 0 };

const mine: CourseSession = { id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1, startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 };
const theirs: CourseSession = { id: "fs1", courseId: "f1", semesterId: "s1", dayOfWeek: 1, startSlot: 2, endSlot: 3, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0 };

// 第 5 周周一
const DATE = "2026-09-28";

const baseInput = { semester, slots, courses: [me], sessions: [mine] };
const friendInput = { semester, slots, courses: [friend], sessions: [theirs] };

describe("personalFreeRanges（模块 12 #1-3）", () => {
  it("本人周一 1-2 节有课 → 空闲为 3-4 节", () => {
    expect(personalFreeRanges(baseInput, DATE)).toEqual([[3, 4]]);
  });
});

describe("commonFreeRanges（模块 12 #5/#6）", () => {
  it("共同空闲为第 4 节，并标注朋友在第 2-3 节忙碌", () => {
    const ranges = commonFreeRanges(baseInput, [friendInput], DATE);
    expect(ranges).toEqual([{ from: 3, to: 4, busyFor: ["朋友早课"] }]);
  });

  it("没有他人时空闲不变", () => {
    expect(commonFreeRanges(baseInput, [], DATE)).toEqual([{ from: 3, to: 4, busyFor: [] }]);
  });
});

describe("recommendMeetingSlot（模块 12 #7 本地）", () => {
  it("返回最长且双方都空闲的段", () => {
    expect(recommendMeetingSlot(baseInput, [friendInput], DATE)).toEqual({ from: 4, to: 4 });
  });
});
