import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CourseSession, Semester } from "@/core/models";
import { CampusFlowDB } from "./dexie";

// 每个测试用独立的数据库实例，避免相互污染
const dbName = `campusflow-test-${Date.now()}`;
const db = new CampusFlowDB(dbName);

const semester: Semester = {
  id: "s1",
  name: "2026-2027学年第一学期",
  startDate: "2026-09-01",
  weekOneAnchor: "2026-08-31",
  totalWeeks: 20,
  weekStartsOn: 1,
  status: "current",
  createdAt: 0,
  updatedAt: 0,
};

const session: CourseSession = {
  id: "cs1",
  courseId: "c1",
  semesterId: "s1",
  dayOfWeek: 1,
  startSlot: 1,
  endSlot: 2,
  weekRule: { type: "odd" },
  createdAt: 0,
  updatedAt: 0,
};

beforeAll(async () => {
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("CampusFlowDB schema v2", () => {
  it("版本号为 2 且包含全部 10 张表", () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "courseExceptions",
      "courseSessions",
      "courses",
      "exams",
      "preferences",
      "reminderRules",
      "scheduleEvents",
      "semesters",
      "timeSlots",
      "timetableProfiles",
    ]);
  });

  it("学期写入与读取", async () => {
    await db.semesters.put(semester);
    const got = await db.semesters.get("s1");
    expect(got?.name).toBe("2026-2027学年第一学期");
    expect(got?.totalWeeks).toBe(20);
  });

  it("上课安排：复合索引 [semesterId+dayOfWeek] 查询", async () => {
    await db.courseSessions.put(session);
    await db.courseSessions.put({
      ...session,
      id: "cs2",
      dayOfWeek: 3,
      weekRule: { type: "range", from: 1, to: 8 },
    });
    const mondayOnly = await db.courseSessions
      .where("[semesterId+dayOfWeek]")
      .equals(["s1", 1])
      .toArray();
    expect(mondayOnly).toHaveLength(1);
    expect(mondayOnly[0]?.id).toBe("cs1");
  });

  it("按学期查询课程安排", async () => {
    const all = await db.courseSessions
      .where("semesterId")
      .equals("s1")
      .toArray();
    expect(all).toHaveLength(2);
  });

  it("偏好设置写入与读取", async () => {
    await db.preferences.put({
      key: "app",
      value: { themeId: "sakura", mode: "dark", accent: "rose" },
      updatedAt: 1,
    });
    const rec = await db.preferences.get("app");
    expect(rec?.key).toBe("app");
    const value = rec?.value as Record<string, unknown> | undefined;
    expect(value?.themeId).toBe("sakura");
  });

  it("课程删除快照 → 恢复（撤销）往返", async () => {
    const { deleteCourse, restoreCourseSnapshot } = await import("./courses");
    const snapshot = await deleteCourse("c-not-exist", db); // 不存在 → null
    expect(snapshot).toBeNull();

    // 先造一门带安排的课程
    await db.courses.put({
      id: "c-del", semesterId: "s1", name: "待删课程", type: "lecture", color: "sky",
      order: 9, createdAt: 0, updatedAt: 0,
    });
    await db.courseSessions.put({ ...session, id: "cs-del", courseId: "c-del" });

    const snap = await deleteCourse("c-del", db);
    expect(snap?.course.name).toBe("待删课程");
    expect(snap?.sessions).toHaveLength(1);
    expect(await db.courses.get("c-del")).toBeUndefined();

    await restoreCourseSnapshot(snap!, db);
    const restored = await db.courses.get("c-del");
    expect(restored?.name).toBe("待删课程");
    expect((await db.courseSessions.where("courseId").equals("c-del").toArray())).toHaveLength(1);
  });
});
