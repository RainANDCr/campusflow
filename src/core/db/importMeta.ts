import { db } from "./dexie";

/**
 * 导入历史与导入模板（模块 03 #24 / #17）。
 * 存于 preferences 表的独立 key（不进 schema 迁移；随 JSON 备份一起导出）。
 */

const HISTORY_KEY = "importHistory";
const TEMPLATE_KEY = "importTemplates";
const MAX_HISTORY = 20;

export interface ImportHistoryEntry {
  time: number;
  source: string;
  imported: number;
  failed: number;
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  const rec = await db.preferences.get(HISTORY_KEY);
  if (!rec || !Array.isArray(rec.value)) return [];
  return rec.value as ImportHistoryEntry[];
}

export async function recordImport(entry: Omit<ImportHistoryEntry, "time">): Promise<void> {
  const list = await getImportHistory();
  const next = [{ ...entry, time: Date.now() }, ...list].slice(0, MAX_HISTORY);
  await db.preferences.put({ key: HISTORY_KEY, value: next, updatedAt: Date.now() });
}

export async function clearImportHistory(): Promise<void> {
  await db.preferences.delete(HISTORY_KEY);
}

/** 字段映射模板：名称 → 映射（列号）。 */
export interface ImportTemplate {
  name: string;
  mapping: Record<string, number | undefined>;
}

export async function getImportTemplates(): Promise<ImportTemplate[]> {
  const rec = await db.preferences.get(TEMPLATE_KEY);
  if (!rec || typeof rec.value !== "object" || rec.value === null) return [];
  const obj = rec.value as Record<string, ImportTemplate["mapping"]>;
  return Object.entries(obj).map(([name, mapping]) => ({ name, mapping }));
}

export async function saveImportTemplate(
  name: string,
  mapping: Record<string, number | undefined>,
): Promise<void> {
  const rec = await db.preferences.get(TEMPLATE_KEY);
  const obj =
    rec && typeof rec.value === "object" && rec.value !== null
      ? (rec.value as Record<string, ImportTemplate["mapping"]>)
      : {};
  obj[name] = mapping;
  await db.preferences.put({ key: TEMPLATE_KEY, value: obj, updatedAt: Date.now() });
}

export async function deleteImportTemplate(name: string): Promise<void> {
  const rec = await db.preferences.get(TEMPLATE_KEY);
  if (!rec || typeof rec.value !== "object" || rec.value === null) return;
  const obj = rec.value as Record<string, ImportTemplate["mapping"]>;
  delete obj[name];
  await db.preferences.put({ key: TEMPLATE_KEY, value: obj, updatedAt: Date.now() });
}
