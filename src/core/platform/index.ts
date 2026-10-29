import { platform } from "./detect";
import type { NotificationAdapter } from "./types";
import { webNotificationAdapter } from "./webNotifications";
import { capacitorNotificationAdapter } from "./capacitorNotifications";

export type { NotificationAdapter, NotificationPermissionState } from "./types";

/**
 * 按运行平台返回通知适配器。
 * - web / tauri：Web Notification（Tauri 的 WebView2 映射为 Windows 系统通知）
 * - capacitor：@capacitor/local-notifications 原生本地通知
 */
export function getNotificationAdapter(): NotificationAdapter {
  if (platform === "capacitor") return capacitorNotificationAdapter;
  return webNotificationAdapter;
}
