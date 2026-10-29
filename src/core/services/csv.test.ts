import { describe, expect, it } from "vitest";
import type { Course, CourseSession } from "@/core/models";
import {
  exportCoursesCsv,
  guessColumnMapping,
  mapCsvRows,
  parseCsv,
  parseDayOfWeekText,
  parseWeekRuleText,
  rowsToCsv,
} from "./csv";

describe("parseCsv", () => {
  it("基础解析", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("引号内逗号与转义引号", () => {
    expect(parseCsv('"a,x",b,"he said ""hi"""')).toEqual([
      ["a,x", "b", 'he said "hi"'],
    ]);
  });

  it("引号内换行与 CRLF", () => {
    expect(parseCsv('a,"line1\r\nline2"\r\nb,c')).toEqual([
      ["a", "line1\nline2"],
      ["b", "c"],
    ]);
  });

  it("跳过空行并去除 BOM", () => {
    expect(parseCsv("\uFEFFa,b\n\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("rowsToCsv / exportCoursesCsv", () => {
  const course: Course = {
    id: "c1", semesterId: "s1", name: "高等数学", type: "lecture", color: "sky",
    teacher: "张教授", room: "教一-101", note: "带教材", order: 0, createdAt: 0, updatedAt: 0,
  };
  const session: CourseSession = {
    id: "cs1", courseId: "c1", semesterId: "s1", dayOfWeek: 1, startSlot: 1, endSlot: 2,
    weekRule: { type: "range", from: 1, to: 8 }, createdAt: 0, updatedAt: 0,
  };

  it("导出包含全部列与中文周次", () => {
    const csv = exportCoursesCsv([{ course, sessions: [session] }]);
    expect(csv).toContain("课程名称");
    expect(csv).toContain("高等数学");
    expect(csv).toContain("周一"); // 星期列
    expect(csv).toContain("1-8周"); // 周次文本
  });

  it("含逗号的备注会被引号包裹且可往返解析", () => {
    const withComma: Course = { ...course, note: "第一周,第二周考试" };
    const csv = exportCoursesCsv([{ course: withComma, sessions: [] }]);
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    expect(rows[1]?.[11]).toBe("第一周,第二周考试");
  });
});

describe("parseWeekRuleText", () => {
  it("识别常见写法", () => {
    expect(parseWeekRuleText("全部", 20)).toEqual({ type: "all" });
    expect(parseWeekRuleText("每周", 20)).toEqual({ type: "all" });
    expect(parseWeekRuleText("单周", 20)).toEqual({ type: "odd" });
    expect(parseWeekRuleText("双周", 20)).toEqual({ type: "even" });
    expect(parseWeekRuleText("1-8周", 20)).toEqual({ type: "range", from: 1, to: 8 });
    expect(parseWeekRuleText("1~8", 20)).toEqual({ type: "range", from: 1, to: 8 });
    expect(parseWeekRuleText("1、3、5周", 20)).toEqual({ type: "custom", weeks: [1, 3, 5] });
    expect(parseWeekRuleText("1,3,5", 20)).toEqual({ type: "custom", weeks: [1, 3, 5] });
    expect(parseWeekRuleText("", 20)).toBeNull();
    expect(parseWeekRuleText("abc", 20)).toBeNull();
  });
});

describe("parseDayOfWeekText", () => {
  it("识别中英文与数字", () => {
    expect(parseDayOfWeekText("周一")).toBe(1);
    expect(parseDayOfWeekText("星期日")).toBe(7);
    expect(parseDayOfWeekText("Mon")).toBe(1);
    expect(parseDayOfWeekText("SUN")).toBe(7);
    expect(parseDayOfWeekText("3")).toBe(3);
    expect(parseDayOfWeekText("")).toBeNull();
  });
});

describe("guessColumnMapping", () => {
  it("按表头猜测字段", () => {
    const m = guessColumnMapping(["课程名称", "任课教师", "上课地点", "星期", "开始节次", "结束节次", "周次"]);
    expect(m.name).toBe(0);
    expect(m.teacher).toBe(1);
    expect(m.room).toBe(2);
    expect(m.day).toBe(3);
    expect(m.startSlot).toBe(4);
    expect(m.endSlot).toBe(5);
    expect(m.weeks).toBe(6);
  });
});

describe("mapCsvRows", () => {
  const rows = rowsToCsv([
    ["课程名称", "教师", "教室", "星期", "开始节次", "结束节次", "周次"],
    ["高等数学", "张三", "教一-101", "周一", "1", "2", "1-8周"],
    ["大学英语", "李四", "文B-202", "周三", "3", "4", "单周"],
    ["", "无名列", "x", "周二", "1", "1", "全部"],
  ]).split("\r\n").map((line) => parseCsv(line)[0] ?? []);

  it("映射并转换数据行", () => {
    const drafts = mapCsvRows(rows.slice(1), {
      name: 0, teacher: 1, room: 2, day: 3, startSlot: 4, endSlot: 5, weeks: 6,
      building: undefined, type: undefined, color: undefined, note: undefined,
    }, 20);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      name: "高等数学",
      teacher: "张三",
      dayOfWeek: 1,
      startSlot: 1,
      endSlot: 2,
      weekRule: { type: "range", from: 1, to: 8 },
    });
    expect(drafts[1]?.weekRule).toEqual({ type: "odd" });
    expect(drafts[2]?.error).toBe("缺少课程名称");
  });

  it("默认周次规则为全部", () => {
    const drafts = mapCsvRows(
      [["高数", "张三", "", "周一", "1", "2", ""]],
      { name: 0, teacher: 1, building: 2, day: 3, startSlot: 4, endSlot: 5, weeks: undefined, room: undefined, type: undefined, color: undefined, note: undefined },
      20,
    );
    expect(drafts[0]?.weekRule).toEqual({ type: "all" });
  });
});
