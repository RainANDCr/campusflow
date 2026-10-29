import { describe, expect, it } from "vitest";
import { decryptText, encryptText, isEncryptedBackup } from "./cryptoBackup";
import { getAutoBackups, runAutoBackupIfNeeded } from "./autoBackup";
import { parseBackupJson, restoreBackup } from "./backup";
import { db } from "./dexie";

describe("备份加密（模块 17 #7）", () => {
  const validSemester = {
    id: "s-enc", name: "加密测试学期", startDate: "2026-09-01", weekOneAnchor: "2026-08-31",
    totalWeeks: 16, weekStartsOn: 1, status: "current", createdAt: 0, updatedAt: 0,
  };
  const plain = JSON.stringify({
    meta: { id: "m1", createdAt: 1, schemaVersion: 2, appVersion: "test", counts: {} },
    data: { semesters: [validSemester] },
  });

  it("加密 → 解密往返一致", async () => {
    const encrypted = await encryptText(plain, "正确密码123");
    expect(isEncryptedBackup(encrypted)).toBe(true);
    const decrypted = await decryptText(encrypted, "正确密码123");
    expect(decrypted).toBe(plain);
  });

  it("错误密码解密失败并给出明确错误", async () => {
    const encrypted = await encryptText(plain, "正确密码123");
    await expect(decryptText(encrypted, "错误密码")).rejects.toThrow("密码错误");
  });

  it("空密码拒绝加密；损坏数据拒绝解密", async () => {
    await expect(encryptText(plain, "")).rejects.toThrow("密码");
    const encrypted = await encryptText(plain, "pw");
    const broken = encrypted.slice(0, -8) + "AAAAAAAA";
    await expect(decryptText(broken, "pw")).rejects.toThrow();
  });

  it("加密备份解密后可正常导入", async () => {
    const encrypted = await encryptText(plain, "pw2");
    const restored = await decryptText(encrypted, "pw2");
    const backup = parseBackupJson(restored);
    const report = await restoreBackup(backup, "merge");
    expect(report.imported.semesters).toBe(1);
  });
});

describe("自动定期备份（模块 17 #4）", () => {
  it("距上次不足 24 小时跳过；超过则生成并保留最近 3 份", async () => {
    const now = Date.now();
    // 首次：立即生成
    expect(await runAutoBackupIfNeeded(now)).toBe(true);
    let list = await getAutoBackups();
    expect(list).toHaveLength(1);
    // 1 小时后：跳过
    expect(await runAutoBackupIfNeeded(now + 3600_000)).toBe(false);
    // 25 小时后：生成第 2 份；再过 25h：第 3 份；再过 25h：第 4 份但只留 3 份
    expect(await runAutoBackupIfNeeded(now + 25 * 3600_000)).toBe(true);
    expect(await runAutoBackupIfNeeded(now + 50 * 3600_000)).toBe(true);
    expect(await runAutoBackupIfNeeded(now + 75 * 3600_000)).toBe(true);
    list = await getAutoBackups();
    expect(list).toHaveLength(3);
    expect(list[0]!.time).toBe(now + 75 * 3600_000); // 最新在前
    // 快照内容可解析
    const data = await db.preferences.get(list[0]!.key);
    expect(typeof data?.value).toBe("string");
    const parsed = JSON.parse(data!.value as string);
    expect(parsed.data.semesters).toBeDefined();
  });
});
