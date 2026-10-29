/**
 * 生成全局唯一 ID。
 * 优先使用 Web Crypto 的 randomUUID（所有目标平台均支持），
 * 极旧 WebView 环境回退到时间戳 + 随机数。
 */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
