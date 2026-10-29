import { parseBackupJson, restoreBackup, collectBackup } from "@/core/db/backup";

/**
 * WebDAV 同步适配器（模块 17 #13-20 本地凭据版）。
 * 用户主动提供自己的 WebDAV 服务器与凭据（如坚果云），凭据只存本机
 * preferences 表，绝不进备份文件、不打包进代码、不写日志。
 * 同步语义：上传整份备份 / 下载远端备份（手动选择覆盖或合并），冲突由用户显式裁决。
 */

export interface WebDAVConfig {
  url: string;
  username: string;
  /** 仅存本机 preferences，不进备份导出 */
  password: string;
  /** 远端目录（不含尾斜杠），默认 /campusflow */
  directory?: string;
}

export const WEBDAV_CONFIG_KEY = "webdavConfig";
export const WEBDAV_REMOTE_FILE = "campusflow-backup.json";

export async function getWebDAVConfig(): Promise<WebDAVConfig | null> {
  const rec = await import("./dexie").then(({ db }) => db.preferences.get(WEBDAV_CONFIG_KEY));
  if (!rec || typeof rec.value !== "object" || rec.value === null) return null;
  const v = rec.value as Partial<WebDAVConfig>;
  if (typeof v.url !== "string" || typeof v.username !== "string") return null;
  return {
    url: v.url,
    username: v.username,
    password: v.password ?? "",
    directory: v.directory ?? "/campusflow",
  };
}

export async function saveWebDAVConfig(config: WebDAVConfig): Promise<void> {
  const { db } = await import("./dexie");
  await db.preferences.put({
    key: WEBDAV_CONFIG_KEY,
    value: config,
    updatedAt: Date.now(),
  });
}

export async function clearWebDAVConfig(): Promise<void> {
  const { db } = await import("./dexie");
  await db.preferences.delete(WEBDAV_CONFIG_KEY);
}

function joinUrl(config: WebDAVConfig, fileName: string): string {
  const dir = (config.directory ?? "/campusflow").replace(/\/+$/, "");
  return `${config.url.replace(/\/+$/, "")}${dir}/${fileName}`;
}

async function davFetch(
  config: WebDAVConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const auth = btoa(`${config.username}:${config.password}`);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(init.headers ?? {}),
    },
  });
}

/** 连接测试：对目录发 PROPFIND。 */
export async function testWebDAVConnection(config: WebDAVConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await davFetch(config, joinUrl(config, ""), {
      method: "PROPFIND",
      headers: { Depth: "0" },
    });
    if (res.ok || res.status === 207) return { ok: true, message: "连接成功" };
    if (res.status === 401) return { ok: false, message: "认证失败：请检查用户名/密码" };
    if (res.status === 404) return { ok: false, message: "目录不存在，多数服务器会自动创建，可尝试上传" };
    return { ok: false, message: `服务器返回 ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "网络错误" };
  }
}

/** 上传整份备份到远端（PUT）。 */
export async function uploadToWebDAV(config: WebDAVConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const backup = await collectBackup();
    const res = await davFetch(config, joinUrl(config, WEBDAV_REMOTE_FILE), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backup),
    });
    if (res.ok || res.status === 201 || res.status === 204) {
      return { ok: true, message: `已上传（${Object.values(backup.meta.counts).reduce((a, b) => a + b, 0)} 条）` };
    }
    return { ok: false, message: `上传失败：服务器返回 ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "网络错误" };
  }
}

export interface RemoteBackupInfo {
  raw: string;
  counts: Record<string, number>;
  createdAt: number;
}

/** 下载远端备份内容（GET），返回解析后的预览信息。 */
export async function downloadFromWebDAV(config: WebDAVConfig): Promise<RemoteBackupInfo> {
  const res = await davFetch(config, joinUrl(config, WEBDAV_REMOTE_FILE), { method: "GET" });
  if (!res.ok) throw new Error(`下载失败：服务器返回 ${res.status}`);
  const raw = await res.text();
  const backup = parseBackupJson(raw);
  return { raw, counts: backup.meta.counts, createdAt: backup.meta.createdAt };
}

/** 用远端备份恢复到本机（mode 由调用方决定：merge/replace）。 */
export async function restoreFromWebDAV(
  config: WebDAVConfig,
  mode: "merge" | "replace",
): Promise<{ imported: number }> {
  const info = await downloadFromWebDAV(config);
  const report = await restoreBackup(parseBackupJson(info.raw), mode);
  return { imported: Object.values(report.imported).reduce((a, b) => a + b, 0) };
}
