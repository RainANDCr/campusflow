import { describe, expect, it } from "vitest";
import type { WeekRule } from "@/core/models";
import {
  buildSharePayload,
  isSharePayload,
  parseAnyText,
  parseSharePayload,
  parseTimetableLine,
  parseTimetableText,
} from "./textImport";

describe("parseTimetableLine", () => {
  it("解析「课程 周N 节次 周次 教室」常见格式", () => {
    const p = parseTimetableLine("高等数学 周一 1-2节 1-8周 教一101");
    expect(p).toMatchObject({
      name: "高等数学",
      dayOfWeek: 1,
      startSlot: 1,
      endSlot: 2,
      room: "教一101",
    });
    expect(p?.weekRuleText).toContain("1-8");
  });

  it("解析分号分隔与教师标注", () => {
    const p = parseTimetableLine("大学英语；周三 3-4；单周；文B-202；教师：李四");
    expect(p).toMatchObject({
      name: "大学英语",
      dayOfWeek: 3,
      startSlot: 3,
      endSlot: 4,
      room: "文B-202",
      teacher: "李四",
    });
    expect(p?.weekRuleText).toBe("单周");
  });

  it("数字星期与不连续周次", () => {
    const p = parseTimetableLine("体育 周5 5-6 1,3,5周");
    expect(p).toMatchObject({ name: "体育", dayOfWeek: 5, startSlot: 5, endSlot: 6 });
    expect(p?.weekRuleText).toBe("1,3,5周");
  });

  it("缺名称/缺星期返回带原因的失败行", () => {
    expect(parseTimetableLine("周一 1-2节")?.error).toBe("未识别到课程名称");
    expect(parseTimetableLine("神秘课程 教一101")?.error).toBe("未识别到星期");
  });

  it("注释行与空行跳过", () => {
    expect(parseTimetableLine("# 备注")).toBeNull();
    expect(parseTimetableLine("   ")).toBeNull();
  });
});

describe("parseTimetableText", () => {
  it("多行解析为草稿列表", () => {
    const drafts = parseTimetableText(
      "高等数学 周一 1-2节 1-8周 教一101\n大学英语 周三 3-4 单周\n# 注释",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.weekRule).toEqual({ type: "range", from: 1, to: 8 });
    expect(drafts[1]?.weekRule).toEqual({ type: "odd" });
  });
});

describe("分享载荷（模块 03 #23）", () => {
  const entries = [
    {
      name: "高等数学",
      dayOfWeek: 1,
      startSlot: 1,
      endSlot: 2,
      weekRule: { type: "range", from: 1, to: 8 } as WeekRule,
      room: "教一101",
      teacher: "张三",
    },
  ];

  it("构建与解析往返一致", () => {
    const payload = buildSharePayload(entries);
    expect(isSharePayload(payload)).toBe(true);
    const drafts = parseSharePayload(payload);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      name: "高等数学",
      dayOfWeek: 1,
      startSlot: 1,
      endSlot: 2,
      room: "教一101",
      teacher: "张三",
      weekRule: { type: "range", from: 1, to: 8 },
    });
  });

  it("中文经 UTF-8 Base64 无损", () => {
    const payload = buildSharePayload([
      { ...entries[0]!, name: "概率论与数理统计", room: "教三-401" },
    ]);
    const drafts = parseSharePayload(payload);
    expect(drafts[0]?.name).toBe("概率论与数理统计");
    expect(drafts[0]?.room).toBe("教三-401");
  });

  it("损坏的载荷返回空数组", () => {
    expect(parseSharePayload("campusflow-share:v1:!!!broken!!!")).toEqual([]);
    expect(parseAnyText("campusflow-share:v1:!!!broken!!!")).toEqual([]);
  });
});
