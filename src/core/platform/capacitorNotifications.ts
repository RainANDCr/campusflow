import type {
  NotificationAdapter,
  NotificationPermissionState,
} from "./types";

/**
 * Capacitor 本地通知适配器（Android / iOS 原生通知）。
 * 仅在 Capacitor 壳内调用；Web 构建中模块仍会被打包但不会被使用。
 */
class CapacitorNotificationAdapter implements NotificationAdapter {
  /** Capacitor 通知 ID 必须是数字：把稳定字符串哈希成 31 位整数。 */
  private numericId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2_000_000_000;
  }

  private async plugin() {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return LocalNotifications;
  }

  async getPermissionState(): Promise<NotificationPermissionState> {
    try {
      const LocalNotifications = await this.plugin();
      const state = await LocalNotifications.checkPermissions();
      if (state.display === "granted") return "granted";
      if (state.display === "denied") return "denied";
      return "default";
    } catch {
      return "denied";
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const LocalNotifications = await this.plugin();
      const state = await LocalNotifications.requestPermissions();
      if (state.display === "granted") return "granted";
      if (state.display === "denied") return "denied";
      return "default";
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
    if (input.fireAt <= Date.now()) return;
    const LocalNotifications = await this.plugin();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: this.numericId(input.id),
          title: input.title,
          body: input.body,
          schedule: { at: new Date(input.fireAt), allowWhileIdle: true },
        },
      ],
    });
  }

  async cancelReminder(id: string): Promise<void> {
    try {
      const LocalNotifications = await this.plugin();
      await LocalNotifications.cancel({
        notifications: [{ id: this.numericId(id) }],
      });
    } catch {
      // 尚未调度过时取消会失败，忽略
    }
  }
}

export const capacitorNotificationAdapter = new CapacitorNotificationAdapter();
