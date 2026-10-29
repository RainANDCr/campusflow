import type { CSSProperties } from "react";
import { isCourseColorId } from "@/core/models";

/** 课程实例的颜色样式（基于课程色板 CSS 变量 + color-mix，明暗模式自适应）。 */
export function instanceStyle(color: string): CSSProperties {
  const id = isCourseColorId(color) ? color : "graphite";
  const rgb = `var(--course-${id})`;
  return {
    color: `rgb(${rgb})`,
    background: `color-mix(in srgb, rgb(${rgb}) 13%, var(--card))`,
    borderColor: `color-mix(in srgb, rgb(${rgb}) 30%, transparent)`,
  };
}
