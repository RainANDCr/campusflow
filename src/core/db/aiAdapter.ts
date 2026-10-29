/**
 * AI 适配层（模块 13）：用户自带 Key（BYOK），OpenAI 兼容 chat/completions 接口。
 * 隐私约束（共享规范第 5 节）：
 * - API Key 只存本机 preferences 表，绝不进 JSON 备份、不写日志
 * - AI 输出一律视为“提案”：schema 校验 + 差异预览 + 用户确认后入库
 * - 功能默认关闭；未配置 Key 时相关按钮不出现
 */
import { db } from "./dexie";
import type { MappedCourseDraft } from "@/core/services/csv";

const AI_CONFIG_KEY = "aiConfig";

export interface AIConfig {
  /** OpenAI 兼容端点，如 https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const rec = await db.preferences.get(AI_CONFIG_KEY);
  if (!rec || typeof rec.value !== "object" || rec.value === null) return null;
  const v = rec.value as Partial<AIConfig>;
  if (typeof v.baseUrl !== "string" || typeof v.model !== "string" || !v.apiKey) return null;
  return { baseUrl: v.baseUrl.replace(/\/+$/, ""), model: v.model, apiKey: v.apiKey, enabled: v.enabled !== false };
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await db.preferences.put({ key: AI_CONFIG_KEY, value: config, updatedAt: Date.now() });
}

export async function clearAIConfig(): Promise<void> {
  await db.preferences.delete(AI_CONFIG_KEY);
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** 调用 chat/completions；网络/鉴权错误抛出带原因的异常。 */
async function chat(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0 }),
  });
  if (!res.ok) {
    const detail = res.status === 401 ? "API Key 无效" : `服务器返回 ${res.status}`;
    throw new Error(`AI 请求失败：${detail}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("AI 未返回 JSON 数组");
  return JSON.parse(raw.slice(start, end + 1));
}

function isWeekRule(v: unknown): boolean {
  return typeof v === "object" && v !== null && "type" in v;
}

/**
 * AI 课表文本识别（模块 13 #3/#10 的 AI 增强）：把任意格式的课表文本转为结构化课程草稿。
 * 返回提案（草稿），不直接写库。
 */
export async function aiParseTimetable(text: string): Promise<MappedCourseDraft[]> {
  const config = await getAIConfig();
  if (!config) throw new Error("请先在设置中配置 AI（需要你自己的 API Key）");
  const content = await chat(config, [
    {
      role: "system",
      content:
        '你是课表解析器。把用户给的课表文本解析为 JSON 数组，每项字段：name(课程名,string)、dayOfWeek(1-7,1=周一)、startSlot(开始节次,int)、endSlot(结束节次,int)、weekRule(对象: {type:"all"|"odd"|"even"|"range"|"custom", from?,to?,weeks?})、room(教室,string|null)、teacher(教师,string|null)。只输出 JSON，不要解释。无法确定的字段用 null 或省略。',
    },
    { role: "user", content: text.slice(0, 4000) },
  ]);
  const parsed = extractJson(content) as Array<Record<string, unknown>>;
  if (!Array.isArray(parsed)) throw new Error("AI 返回格式异常");
  return parsed.map((item) => ({
    name: typeof item.name === "string" ? item.name : "",
    teacher: typeof item.teacher === "string" ? item.teacher : undefined,
    room: typeof item.room === "string" ? item.room : undefined,
    type: "lecture" as const,
    color: "sky",
    dayOfWeek: typeof item.dayOfWeek === "number" ? item.dayOfWeek : null,
    startSlot: typeof item.startSlot === "number" ? item.startSlot : null,
    endSlot: typeof item.endSlot === "number" ? item.endSlot : null,
    weekRule: isWeekRule(item.weekRule) ? (item.weekRule as MappedCourseDraft["weekRule"]) : { type: "all" as const },
    error:
      typeof item.name !== "string" || !item.name
        ? "AI 未给出课程名"
        : typeof item.dayOfWeek !== "number"
          ? "AI 未给出星期"
          : undefined,
  }));
}
