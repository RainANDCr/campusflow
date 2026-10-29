import { describe, expect, it } from "vitest";
import type { Course, CourseException, CourseSession, Semester } from "@/core/models";
import { buildSemesterIcs, parseIcs } from "./ics";
import { getRawWeek } from "./weekCalc";

const semester: Semester = {
  id: "s1", name: "2026-2027学年第一学期", startDate: "2026-08-31",
  weekOneAnchor: "2026-08-31", totalWeeks: 20, weekStartsOn: 1,
  status: "current", createdAt: 0, updatedAt: 0,
};

const course: Course = {
  id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky",
  room: "教一-101", teacher: "张教授", order: 0, createdAt: 0, updatedAt: 0,
};

const session: CourseSession = {
  id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1,
  startSlot: 1, endSlot: 2, weekRule: { type: "all" }, createdAt: 0, updatedAt: 0,
};

const slots = [
  { id: "t1", semesterId: "s1", index: 1, startTime: "08:00", endTime: "08:45", createdAt: 0, updatedAt: 0 },
  { id: "t2", semesterId: "s1", index: 2, startTime: "08:55", endTime: "09:40", createdAt: 0, updatedAt: 0 },
];

describe("buildSemesterIcs", () => {
  it("生成合法 VCALENDAR 并展开全部周次", () => {
    const ics = buildSemesterIcs(semester, [course], [session], slots, []);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    // 20 周 × 每周 1 次 = 20 个 VEVENT
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(20);
    expect(ics).toContain("SUMMARY:高等数学");
    expect(ics).toContain("LOCATION:教一-101");
    // 第 1 周周一 08:00（浮动本地时间）
    expect(ics).toContain("DTSTART:20260831T080000");
    // UID 稳定（session@date）
    expect(ics).toContain("UID:cs1@2026-09-07@campusflow");
  });

  it("停课的日期不生成事件", () => {
    const ex: CourseException = {
      id: "e1", kind: "cancel", semesterId: "s1", courseId: "c1", sessionId: "cs1",
      originalDate: "2026-08-31", createdAt: 0, updatedAt: 0,
    };
    const ics = buildSemesterIcs(semester, [course], [session], slots, [ex]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(19);
    expect(ics).not.toContain("UID:cs1@2026-08-31@campusflow");
  });

  it("补课日期会额外生成事件", () => {
    const ex: CourseException = {
      id: "e2", kind: "extra", semesterId: "s1", courseId: "c1",
      date: "2026-10-03", startSlot: 1, endSlot: 2, createdAt: 0, updatedAt: 0,
    };
    const ics = buildSemesterIcs(semester, [course], [session], slots, [ex]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(21);
    expect(ics).toContain("DTSTART:20261003T080000");
  });

  it("周次计算与教学周锚点一致", () => {
    expect(getRawWeek(semester, "2026-08-31")).toBe(1);
    expect(getRawWeek(semester, "2026-09-06")).toBe(1);
    expect(getRawWeek(semester, "2026-09-07")).toBe(2);
    expect(getRawWeek(semester, "2026-08-24")).toBe(0);
  });
});

describe("parseIcs", () => {
  it("解析日期型与时间型事件", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:a@x",
      "DTSTART;VALUE=DATE:20261001",
      "SUMMARY:国庆节",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b@x",
      "DTSTART:20261012T140000",
      "DTEND:20261012T160000",
      "LOCATION:教学楼A\\, 3楼",
      "SUMMARY:讲座：AI 与未来",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcs(ics);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ title: "国庆节", date: "2026-10-01", allDay: true });
    expect(events[1]).toMatchObject({
      title: "讲座：AI 与未来",
      date: "2026-10-12",
      allDay: false,
      startTime: "14:00",
      endTime: "16:00",
      note: "地点：教学楼A, 3楼",
    });
  });

  it("支持折行与缺失 SUMMARY 的条目跳过", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART:20261012T080000",
      "SUMMARY:很长的一门课",
      "  继续标题",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20261013T080000",
      "END:VEVENT",
    ].join("\r\n");
    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("很长的一门课继续标题");
  });
});
