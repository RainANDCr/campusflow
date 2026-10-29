import { describe, expect, it } from "vitest";
import {
  zAppSettings,
  zCourse,
  zCourseException,
  zCourseSession,
  zExam,
  zHHmm,
  zIsoDate,
  zSemester,
  zTimetableProfile,
} from "./index";

const now = 1_700_000_000_000;
const base = { id: "x1", createdAt: now, updatedAt: now };

describe("通用格式", () => {
  it("ISO 日期：接受 yyyy-MM-dd，拒绝其他格式", () => {
    expect(zIsoDate.safeParse("2026-09-01").success).toBe(true);
    expect(zIsoDate.safeParse("2026-9-1").success).toBe(false);
    expect(zIsoDate.safeParse("2026/09/01").success).toBe(false);
  });

  it("HH:mm 时间：24 小时制", () => {
    expect(zHHmm.safeParse("00:00").success).toBe(true);
    expect(zHHmm.safeParse("23:59").success).toBe(true);
    expect(zHHmm.safeParse("24:00").success).toBe(false);
    expect(zHHmm.safeParse("8:00").success).toBe(false);
    expect(zHHmm.safeParse("12:60").success).toBe(false);
  });
});

describe("zSemester", () => {
  it("接受合法学期", () => {
    const r = zSemester.safeParse({
      ...base,
      name: "2026-2027学年第一学期",
      startDate: "2026-09-01",
      weekOneAnchor: "2026-08-31",
      totalWeeks: 20,
      weekStartsOn: 1,
      status: "current",
    });
    expect(r.success).toBe(true);
  });

  it("拒绝空名称、0 周、非法状态", () => {
    const valid = {
      ...base,
      name: "S",
      startDate: "2026-09-01",
      weekOneAnchor: "2026-08-31",
      totalWeeks: 20,
      weekStartsOn: 1,
      status: "current",
    };
    expect(zSemester.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(zSemester.safeParse({ ...valid, totalWeeks: 0 }).success).toBe(false);
    expect(zSemester.safeParse({ ...valid, totalWeeks: 41 }).success).toBe(false);
    expect(zSemester.safeParse({ ...valid, status: "past" }).success).toBe(false);
  });
});

describe("zCourseSession", () => {
  it("接受合法安排（含单双周规则）", () => {
    const r = zCourseSession.safeParse({
      ...base,
      courseId: "c1",
      semesterId: "s1",
      dayOfWeek: 1,
      startSlot: 1,
      endSlot: 2,
      weekRule: { type: "odd" },
    });
    expect(r.success).toBe(true);
  });

  it("拒绝结束节次早于起始节次", () => {
    const r = zCourseSession.safeParse({
      ...base,
      courseId: "c1",
      semesterId: "s1",
      dayOfWeek: 1,
      startSlot: 3,
      endSlot: 2,
      weekRule: { type: "all" },
    });
    expect(r.success).toBe(false);
  });

  it("拒绝星期超出 1-7", () => {
    const r = zCourseSession.safeParse({
      ...base,
      courseId: "c1",
      semesterId: "s1",
      dayOfWeek: 8,
      startSlot: 1,
      endSlot: 2,
      weekRule: { type: "all" },
    });
    expect(r.success).toBe(false);
  });
});

describe("zCourse", () => {
  it("拒绝空课程名", () => {
    const r = zCourse.safeParse({
      ...base,
      semesterId: "s1",
      name: "",
      type: "lecture",
      color: "rose",
      order: 0,
    });
    expect(r.success).toBe(false);
  });

  it("接受合法课程", () => {
    const r = zCourse.safeParse({
      ...base,
      semesterId: "s1",
      name: "高等数学",
      type: "lecture",
      color: "rose",
      order: 0,
    });
    expect(r.success).toBe(true);
  });

  it("接受标签、教学班与课表方案归属（v2 新增字段）", () => {
    const r = zCourse.safeParse({
      ...base,
      semesterId: "s1",
      name: "高等数学（1班）",
      type: "lecture",
      color: "rose",
      order: 0,
      tags: ["必修", "考研课"],
      classGroup: "2026级1班",
      profileId: "p1",
    });
    expect(r.success).toBe(true);
  });

  it("拒绝超过 10 个标签", () => {
    const r = zCourse.safeParse({
      ...base,
      semesterId: "s1",
      name: "X",
      type: "lecture",
      color: "rose",
      order: 0,
      tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("旧形状课程（无 v2 字段）仍可通过校验（备份兼容）", () => {
    const r = zCourse.safeParse({
      ...base,
      semesterId: "s1",
      name: "旧版课程",
      type: "lab",
      color: "teal",
      order: 3,
    });
    expect(r.success).toBe(true);
  });
});

describe("zTimetableProfile", () => {
  it("接受合法方案", () => {
    const r = zTimetableProfile.safeParse({
      ...base,
      semesterId: "s1",
      name: "主课表",
      isPrimary: 1,
      order: 0,
    });
    expect(r.success).toBe(true);
  });

  it("拒绝空名称与非法 isPrimary", () => {
    const valid = { ...base, semesterId: "s1", order: 0 };
    expect(zTimetableProfile.safeParse({ ...valid, name: "  ", isPrimary: 1 }).success).toBe(false);
    expect(zTimetableProfile.safeParse({ ...valid, name: "A", isPrimary: true }).success).toBe(false);
    expect(zTimetableProfile.safeParse({ ...valid, name: "A", isPrimary: 2 }).success).toBe(false);
  });
});

describe("zCourseException", () => {
  const cancel = {
    ...base,
    kind: "cancel",
    semesterId: "s1",
    courseId: "c1",
    sessionId: "cs1",
    originalDate: "2026-10-12",
  };

  it("停课：需要 sessionId + originalDate", () => {
    expect(zCourseException.safeParse(cancel).success).toBe(true);
    expect(
      zCourseException.safeParse({ ...cancel, originalDate: undefined }).success,
    ).toBe(false);
  });

  it("调课：至少修改一项", () => {
    const adjust = { ...cancel, kind: "adjust" };
    expect(zCourseException.safeParse(adjust).success).toBe(false);
    expect(
      zCourseException.safeParse({ ...adjust, newRoom: "教三-401" }).success,
    ).toBe(true);
    // 只改开始节次不合法，必须成对
    expect(
      zCourseException.safeParse({ ...adjust, newStartSlot: 1 }).success,
    ).toBe(false);
    expect(
      zCourseException.safeParse({ ...adjust, newStartSlot: 1, newEndSlot: 2 })
        .success,
    ).toBe(true);
  });

  it("补课：必须指定日期与节次，且结束节次不早于开始节次", () => {
    const extra = {
      ...base,
      kind: "extra",
      semesterId: "s1",
      courseId: "c1",
      date: "2026-10-17",
      startSlot: 1,
      endSlot: 2,
    };
    expect(zCourseException.safeParse(extra).success).toBe(true);
    expect(
      zCourseException.safeParse({ ...extra, endSlot: 0 }).success,
    ).toBe(false);
  });
});

describe("zExam", () => {
  it("拒绝结束时间早于开始时间", () => {
    const r = zExam.safeParse({
      ...base,
      semesterId: "s1",
      name: "高数期末",
      date: "2027-01-10",
      startTime: "14:00",
      endTime: "13:00",
    });
    expect(r.success).toBe(false);
  });
});

describe("zAppSettings", () => {
  it("接受默认设置", () => {
    expect(
      zAppSettings.safeParse({
        themeId: "cream",
        mode: "system",
        accent: "blue",
        decorations: false,
        showWeekend: true,
        showCountdown: true,
        cardDensity: "standard",
        cardShowRoom: true,
        cardShowTeacher: true,
        endOfClassReminder: false,
        firstClassSummary: false,
        weekendReminder: true,
        quietHours: { enabled: false, start: "23:00", end: "07:00" },
        fontSize: "normal",
      }).success,
    ).toBe(true);
  });

  it("拒绝未知主题", () => {
    expect(
      zAppSettings.safeParse({
        themeId: "neon",
        mode: "system",
        accent: "blue",
        decorations: false,
        showWeekend: true,
        showCountdown: true,
        cardDensity: "standard",
        cardShowRoom: true,
        cardShowTeacher: true,
        endOfClassReminder: false,
        firstClassSummary: false,
        weekendReminder: true,
        quietHours: { enabled: false, start: "23:00", end: "07:00" },
        fontSize: "normal",
      }).success,
    ).toBe(false);
  });

  it("拒绝非法静音时间", () => {
    expect(
      zAppSettings.safeParse({
        themeId: "cream",
        mode: "system",
        accent: "blue",
        decorations: false,
        showWeekend: true,
        showCountdown: true,
        cardDensity: "standard",
        cardShowRoom: true,
        cardShowTeacher: true,
        endOfClassReminder: false,
        firstClassSummary: false,
        weekendReminder: true,
        quietHours: { enabled: true, start: "24:00", end: "07:00" },
      }).success,
    ).toBe(false);
  });
});
