import { collectBackup } from "./backup";
import { db } from "./dexie";

/**
 * 自动定期本地备份（模块 17 #4）：
 * 应用启动时若距上次自动备份超过 24 小时，生成完整快照存入 preferences 表。
 * 最多保留 3 份（新顶旧底）；仅存本机，不联网。
 */

const INDEX_KEY = "autoBackupIndex";
const ENTRY_PREFIX = "autoBackup:";
const KEEP = 3;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface AutoBackupEntry {
  time: number;
  key: string;
}

export async function getAutoBackups(): Promise<AutoBackupEntry[]> {
  const rec = await db.preferences.get(INDEX_KEY);
  if (!rec || !Array.isArray(rec.value)) return [];
  return rec.value as AutoBackupEntry[];
}

export async function getAutoBackupData(key: string): Promise<string | null> {
  const rec = await db.preferences.get(key);
  if (!rec || typeof rec.value !== "string") return null;
  return rec.value;
}

async function prune(keep: number): Promise<void> {
  const list = await getAutoBackups();
  const remove = list.slice(keep);
  for (const entry of remove) {
    await db.preferences.delete(entry.key);
  }
  if (remove.length > 0) {
    await db.preferences.put({
      key: INDEX_KEY,
      value: list.slice(0, keep),
      updatedAt: Date.now(),
    });
  }
}

/** 应用启动时调用：距上次超过 24 小时则生成新快照并修剪旧份。幂等。 */
export async function runAutoBackupIfNeeded(now = Date.now()): Promise<boolean> {
  try {
    const list = await getAutoBackups();
    const last = list[0]?.time ?? 0;
    if (now - last < INTERVAL_MS) return false;

    const backup = await collectBackup();
    const time = now;
    const key = `${ENTRY_PREFIX}${time}`;
    await db.preferences.put({ key, value: JSON.stringify(backup), updatedAt: time });
    const next = [{ time, key }, ...list].slice(0, KEEP);
    await db.preferences.put({ key: INDEX_KEY, value: next, updatedAt: time });
    await prune(KEEP);
    return true;
  } catch (err) {
    console.warn("[campusflow] 自动备份失败", err);
    return false;
  }
}
