import { describe, expect, it } from "vitest";
import type { TimetableProfile } from "@/core/models";
import { coursesForProfile, selectActiveProfile } from "./profiles";

const primary: TimetableProfile = {
  id: "p1", semesterId: "s1", name: "主课表", isPrimary: 1, order: 0, createdAt: 0, updatedAt: 0,
};
const alt: TimetableProfile = {
  id: "p2", semesterId: "s1", name: "备选方案", isPrimary: 0, order: 1, createdAt: 0, updatedAt: 0,
};

describe("selectActiveProfile", () => {
  it("优先用户选择", () => {
    expect(selectActiveProfile([primary, alt], "p2")?.id).toBe("p2");
  });

  it("无选择时回退主方案", () => {
    expect(selectActiveProfile([alt, primary], undefined)?.id).toBe("p1");
  });

  it("用户选择已删除的方案 → 回退主方案", () => {
    expect(selectActiveProfile([primary], "ghost")?.id).toBe("p1");
  });

  it("无主方案时取第一个", () => {
    expect(selectActiveProfile([alt], undefined)?.id).toBe("p2");
    expect(selectActiveProfile([], undefined)).toBeUndefined();
  });
});

describe("coursesForProfile", () => {
  const courses = [
    { id: "c1", profileId: "p1" },
    { id: "c2", profileId: "p2" },
    { id: "c3" }, // 旧数据：未归属方案
  ];

  it("按激活方案过滤", () => {
    expect(coursesForProfile(courses, { id: "p2", isPrimary: 0 }).map((c) => c.id)).toEqual(["c2"]);
  });

  it("主方案下可见未归属方案的旧课程（兼容）", () => {
    const ids = coursesForProfile(courses, { id: "p1", isPrimary: 1 }).map((c) => c.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c3");
    expect(ids).not.toContain("c2");
  });

  it("无方案时不过滤", () => {
    expect(coursesForProfile(courses, undefined)).toHaveLength(3);
  });
});
