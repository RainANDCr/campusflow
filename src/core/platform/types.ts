/**
 * 平台适配层接口。
 *
 * 业务代码只依赖这些接口；各平台（Web / Tauri / Capacitor）提供各自实现，
 * 运行时按 detectPlatform() 的结果选择。接口在相应阶段落地实现：
 * - NotificationAdapter：第四阶段（通知系统）
 * - ShareAdapter      ：第五阶段（导出文件）
 * 此处先行固定契约，避免后续阶段改动业务代码。
 */

export type NotificationPermissionState = "granted" | "denied" | "default";

export interface ScheduledReminderInput {
  /** 稳定唯一 ID（取消时使用） */
  id: string;
  title: string;
  body: string;
  /** 触发时间（epoch 毫秒） */
  fireAt: number;
}

/** 本地通知能力。注意：Web 实现不承诺浏览器关闭后仍可触发。 */
export interface NotificationAdapter {
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  scheduleReminder(input: ScheduledReminderInput): Promise<void>;
  cancelReminder(id: string): Promise<void>;
}

/** 文件保存 / 分享能力（导出 PNG、PDF、JSON 等）。 */
export interface ShareAdapter {
  /** 将文件保存到磁盘或唤起系统分享。 */
  saveFile(fileName: string, blob: Blob): Promise<void>;
}
