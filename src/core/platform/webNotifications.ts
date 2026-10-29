import type {
  NotificationAdapter,
  NotificationPermissionState,
} from "./types";

/**
 * Web / Tauri（WebView）通知适配器。
 * - 权限走 Notification API
 * - 调度基于内存 setTimeout：应用打开期间可靠触发；浏览器关闭后不保证（平台限制，如实在 UI 中说明）
 * - Tauri 2 的 WebView2 会把 Web 通知渲染为 Windows 系统通知
 */
class WebNotificationAdapter implements NotificationAdapter {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  async getPermissionState(): Promise<NotificationPermissionState> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }

  async scheduleReminder(input: {
    id: string;
    title: string;
    body: string;
    fireAt: number;
  }): Promise<void> {
    await this.cancelReminder(input.id);
    const delay = input.fireAt - Date.now();
    if (delay <= 0 || delay > 2 ** 31 - 1) return;
    const timer = setTimeout(() => {
      this.timers.delete(input.id);
      this.fire(input.title, input.body);
    }, delay);
    this.timers.set(input.id, timer);
  }

  async cancelReminder(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private fire(title: string, body: string): void {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const notification = new Notification(title, {
        body,
        tag: `campusflow-${title}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // 部分环境在无 Service Worker 时构造函数受限，静默失败不阻塞应用
    }
  }
}

export const webNotificationAdapter = new WebNotificationAdapter();
