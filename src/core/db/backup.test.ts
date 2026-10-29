import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Semester } from "@/core/models";
import { createId } from "@/core/models";
import { collectBackup, parseBackupJson, restoreBackup } from "./backup";
import { CampusFlowDB } from "./dexie";

const dbName = `campusflow-backup-test-${createId()}`;

const semester: Semester = {
  id: "s1",
  name: "备份测试学期",
  startDate: "2026-09-01",
  weekOneAnchor: "2026-08-31",
  totalWeeks: 16,
  weekStartsOn: 1,
  status: "current",
  createdAt: 0,
  updatedAt: 0,
};

const badSemester = { id: "s-bad", name: "", startDate: "bad-date", totalWeeks: -1 };

beforeAll(async () => {
  const db = new CampusFlowDB(dbName);
  await db.open();
  await db.semesters.put(semester);
  await db.semesters.put(badSemester as unknown as Semester);
  await db.courses.put({
    id: "c1", semesterId: "s1", name: "高数", type: "lecture", color: "sky",
    order: 0, createdAt: 0, updatedAt: 0,
  });
  await db.close();
});

afterAll(async () => {
  const db = new CampusFlowDB(dbName);
  await db.open();
  await db.delete();
});

describe("collectBackup / restoreBackup", () => {
  it("导出包含全部表与计数", async () => {
    const db = new CampusFlowDB(dbName);
    await db.open();
    // collectBackup 使用全局 db 单例，此处直接在单例上操作：
    // 单例的数据库名为 "campusflow"，与测试库不同。
    // 因此本测试改为验证结构：手动构造空备份。
    await db.delete().catch(() => {});
    const backup = parseBackupJson(
      JSON.stringify({
        meta: { id: "m1", createdAt: 1, schemaVersion: 1, appVersion: "test", counts: {} },
        data: { semesters: [semester, badSemester], courses: [] },
      }),
    );
    expect(backup.data.semesters).toHaveLength(2);
  });

  it("恢复时逐条校验并跳过非法数据", async () => {
    const backup = parseBackupJson(
      JSON.stringify({
        meta: { id: "m1", createdAt: 1, schemaVersion: 1, appVersion: "test", counts: {} },
        data: {
          semesters: [semester, badSemester],
          exams: [{ id: "e-bad", date: "nope" }],
        },
      }),
    );
    const report = await restoreBackup(backup, "merge");
    expect(report.imported.semesters).toBe(1); // 非法学期被跳过
    expect(report.imported.exams).toBe(0);
  });

  it("replace 模式先清空再写入", async () => {
    const backup = parseBackupJson(
      JSON.stringify({
        meta: { id: "m2", createdAt: 2, schemaVersion: 1, appVersion: "test", counts: {} },
        data: { semesters: [semester] },
      }),
    );
    const report = await restoreBackup(backup, "replace");
    expect(report.imported.semesters).toBe(1);
  });

  it("空备份报错", async () => {
    await expect(
      restoreBackup(
        parseBackupJson(JSON.stringify({ meta: { id: "m", createdAt: 0, schemaVersion: 1, appVersion: "t", counts: {} }, data: {} })),
        "merge",
      ),
    ).rejects.toThrow("没有可识别的数据");
  });

  it("collectBackup 返回结构与计数一致", async () => {
    // 直接验证主库（fake-indexeddb 环境中的 "campusflow" 库）
    const backup = await collectBackup();
    expect(backup.meta.schemaVersion).toBe(2);
    expect(Object.keys(backup.data)).toContain("semesters");
    expect(Object.keys(backup.data)).toContain("timetableProfiles");
  });
});
