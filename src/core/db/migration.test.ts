import Dexie from "dexie";
import { afterAll, describe, expect, it } from "vitest";
import type { Semester } from "@/core/models";
import { createId } from "@/core/models";
import { CampusFlowDB, DB_SCHEMA_VERSION } from "./dexie";
import { ensureProfileConsistency } from "./profiles";

// 与 v1 完全一致的 schema 声明，用于模拟旧版本数据库
const V1_STORES = {
  semesters: "id, status, startDate",
  courses: "id, semesterId, [semesterId+order]",
  courseSessions: "id, courseId, semesterId, [semesterId+dayOfWeek]",
  courseExceptions: "id, semesterId, courseId, kind, originalDate, date",
  timeSlots: "id, semesterId, [semesterId+index]",
  scheduleEvents: "id, semesterId, date",
  exams: "id, semesterId, date",
  reminderRules: "id, scope, courseId",
  preferences: "key",
};

const dbName = `campusflow-migration-test-${createId()}`;

const semester: Semester = {
  id: "s1",
  name: "迁移测试学期",
  startDate: "2026-09-01",
  weekOneAnchor: "2026-08-31",
  totalWeeks: 16,
  weekStartsOn: 1,
  status: "current",
  createdAt: 0,
  updatedAt: 0,
};

async function seedV1(): Promise<void> {
  const old = new Dexie(dbName);
  old.version(1).stores(V1_STORES);
  await old.open();
  await old.table("semesters").put(semester);
  // 两门课程均无 profileId 字段（v1 形状）
  await old.table("courses").bulkPut([
    { id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky", order: 0, createdAt: 0, updatedAt: 0 },
    { id: "c2", semesterId: "s1", name: "大学英语", type: "elective", color: "rose", order: 1, createdAt: 0, updatedAt: 0 },
  ]);
  await old.table("courseSessions").put({
    id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1, startSlot: 1, endSlot: 2,
    weekRule: { type: "all" }, createdAt: 0, updatedAt: 0,
  });
  old.close();
}

describe("schema v1 → v2 迁移", () => {
  it("升级后版本号为 2，存量数据完整保留", async () => {
    await seedV1();
    const db = new CampusFlowDB(dbName);
    await db.open();
    expect(db.verno).toBe(DB_SCHEMA_VERSION);
    expect(db.verno).toBe(2);

    const sem = await db.semesters.get("s1");
    expect(sem?.name).toBe("迁移测试学期");
    const cs = await db.courseSessions.get("cs1");
    expect(cs?.dayOfWeek).toBe(1);
    await db.close();
  });

  it("为存量学期创建主课表方案并回填课程的 profileId", async () => {
    const db = new CampusFlowDB(dbName);
    await db.open();

    const profiles = await db.timetableProfiles.where("semesterId").equals("s1").toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.isPrimary).toBe(1);
    expect(profiles[0]?.name).toBe("主课表");

    const c1 = await db.courses.get("c1");
    const c2 = await db.courses.get("c2");
    expect(c1?.profileId).toBe(profiles[0]?.id);
    expect(c2?.profileId).toBe(profiles[0]?.id);
    await db.close();
  });

  it("ensureProfileConsistency 幂等且修复孤儿课程", async () => {
    const db = new CampusFlowDB(dbName);
    await db.open();
    // 模拟旧备份导入：课程失去 profileId
    await db.courses.where("id").equals("c2").modify((c: Record<string, unknown>) => {
      delete c.profileId;
    });
    await ensureProfileConsistency(db);
    await ensureProfileConsistency(db); // 二次调用不产生重复方案
    const profiles = await db.timetableProfiles.where("semesterId").equals("s1").toArray();
    expect(profiles).toHaveLength(1);
    const c2 = await db.courses.get("c2");
    expect(c2?.profileId).toBe(profiles[0]?.id);
    await db.close();
  });

  it("全新数据库直接建到 v2，无迁移副作用", async () => {
    const fresh = new CampusFlowDB(`campusflow-fresh-${createId()}`);
    await fresh.open();
    expect(fresh.verno).toBe(2);
    expect(await fresh.timetableProfiles.toArray()).toHaveLength(0);
    fresh.close();
    await fresh.delete();
  });

  afterAll(async () => {
    const cleanup = new CampusFlowDB(dbName);
    await cleanup.open();
    await cleanup.delete();
  });
});
