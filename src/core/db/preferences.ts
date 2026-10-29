import {
  DEFAULT_SETTINGS,
  PREF_KEY_SETTINGS,
  zAppSettings,
  type AppSettings,
  type PreferenceRecord,
} from "@/core/models";
import { db } from "./dexie";

/**
 * 读取权威的应用偏好设置。
 * IndexedDB 中的旧版本/残缺数据会与默认值合并后再校验，
 * 校验失败则返回 null（调用方回退到默认值）。
 */
export async function loadAppSettings(): Promise<AppSettings | null> {
  const rec: PreferenceRecord | undefined = await db.preferences.get(
    PREF_KEY_SETTINGS,
  );
  if (!rec) return null;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(typeof rec.value === "object" && rec.value !== null
      ? rec.value
      : {}),
  };
  const parsed = zAppSettings.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

/** 写入偏好设置（整体覆盖式保存）。 */
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const record: PreferenceRecord = {
    key: PREF_KEY_SETTINGS,
    value: settings,
    updatedAt: Date.now(),
  };
  await db.preferences.put(record);
}
