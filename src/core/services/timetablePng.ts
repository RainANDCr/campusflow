import type { ClassTimeSlot, Semester } from "@/core/models";
import type { CourseInstance } from "./schedule";
import { orderedDaysOfWeek } from "./weekCalc";

/** 读取当前主题的 CSS 变量值（Hex 或 RGB 三通道字符串）。 */
function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseRgb(raw: string): [number, number, number] {
  const triplet = raw.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (triplet) {
    return [Number(triplet[1]), Number(triplet[2]), Number(triplet[3])];
  }
  const hex = raw.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const r = Math.round(a[0] * ratio + b[0] * (1 - ratio));
  const g = Math.round(a[1] * ratio + b[1] * (1 - ratio));
  const bl = Math.round(a[2] * ratio + b[2] * (1 - ratio));
  return `rgb(${r},${g},${bl})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function isCourseColor(color: string): boolean {
  return /^(rose|coral|amber|lemon|lime|emerald|teal|sky|blue|violet|fuchsia|graphite)$/.test(
    color,
  );
}

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export interface TimetablePngOptions {
  semester: Semester;
  week: number;
  weekLabel: string;
  dateRange: string;
  slots: ClassTimeSlot[];
  instances: CourseInstance[];
  showWeekend: boolean;
  todayDow: number | null;
}

/**
 * 用 Canvas 手绘当前周课表并输出 PNG。
 * 直接读取主题 CSS 变量，导出结果与界面所见一致（明暗模式都会自适应）。
 */
export async function renderTimetablePng(
  opts: TimetablePngOptions,
): Promise<Blob> {
  const days = orderedDaysOfWeek(opts.semester.weekStartsOn).filter(
    (d) => opts.showWeekend || d <= 5,
  );
  const SCALE = 2;
  const TIME_W = 72;
  const DAY_W = 186;
  const HEADER_H = 96;
  const DAY_HEADER_H = 56;
  const ROW_H = 92;
  const FOOTER_H = 44;
  const W = (TIME_W + days.length * DAY_W + 24) * SCALE;
  const H = (HEADER_H + DAY_HEADER_H + opts.slots.length * ROW_H + FOOTER_H) * SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");

  const background = parseRgb(cssVar("--background") || "#faf7f1");
  const card = parseRgb(cssVar("--card") || "#ffffff");
  const foreground = parseRgb(cssVar("--foreground") || "#3d3a34");
  const mutedFg = parseRgb(cssVar("--muted-foreground") || "#8a8478");
  const border = parseRgb(cssVar("--border") || "#e8e1d4");
  const font = (size: number, weight = "normal") =>
    `${weight} ${size * SCALE}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = `rgb(${background.join(",")})`;
  ctx.fillRect(0, 0, W / SCALE, H / SCALE);

  // 页眉
  ctx.fillStyle = `rgb(${foreground.join(",")})`;
  ctx.font = font(24, "600");
  ctx.fillText(opts.semester.name, 20, 40);
  ctx.fillStyle = mix(foreground, background, 0.55);
  ctx.font = font(15);
  ctx.fillText(opts.weekLabel + (opts.dateRange ? ` · ${opts.dateRange}` : ""), 20, 66);
  ctx.font = font(12);
  ctx.fillText("CampusFlow 课表导出", 20, 86);

  const gridTop = HEADER_H + DAY_HEADER_H;
  const gridLeft = 12 + TIME_W;

  // 星期表头
  days.forEach((dow, i) => {
    const x = gridLeft + i * DAY_W;
    const isToday = opts.todayDow === dow;
    if (isToday) {
      ctx.fillStyle = mix(
        parseRgb(cssVar("--course-blue") || "59 130 246"),
        card,
        0.12,
      );
      ctx.fillRect(x, HEADER_H, DAY_W, DAY_HEADER_H + opts.slots.length * ROW_H);
    }
    ctx.fillStyle = isToday ? `rgb(${parseRgb(cssVar("--primary") || "#3b82f6").join(",")})` : `rgb(${mutedFg.join(",")})`;
    ctx.font = font(13, "600");
    ctx.textAlign = "center";
    ctx.fillText(DAY_LABELS[dow - 1] ?? "", x + DAY_W / 2, HEADER_H + 24);
    ctx.font = font(12);
    const date = instDate(opts.semester, opts.week, dow);
    ctx.fillText(date, x + DAY_W / 2, HEADER_H + 44);
    ctx.textAlign = "left";
  });

  // 网格线 + 时间列
  ctx.strokeStyle = `rgb(${border.join(",")})`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= opts.slots.length; i++) {
    const y = gridTop + i * ROW_H;
    ctx.beginPath();
    ctx.moveTo(12, y + 0.5);
    ctx.lineTo(12 + TIME_W + days.length * DAY_W, y + 0.5);
    ctx.stroke();
  }
  opts.slots.forEach((slot, i) => {
    const y = gridTop + i * ROW_H;
    ctx.fillStyle = `rgb(${mutedFg.join(",")})`;
    ctx.font = font(11, "600");
    ctx.textAlign = "center";
    ctx.fillText(`第${slot.index}节`, 12 + TIME_W / 2, y + 38);
    ctx.font = font(10);
    ctx.fillText(slot.startTime, 12 + TIME_W / 2, y + 56);
    ctx.textAlign = "left";
  });
  days.forEach((_, i) => {
    const x = gridLeft + i * DAY_W + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, HEADER_H);
    ctx.lineTo(x, gridTop + opts.slots.length * ROW_H);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(12.5, HEADER_H);
  ctx.lineTo(12.5, gridTop + opts.slots.length * ROW_H);
  ctx.stroke();

  // 课程卡片（分道）
  const byDay = new Map<number, CourseInstance[]>();
  for (const inst of opts.instances) {
    if (inst.variant === "moved-away") continue;
    const arr = byDay.get(inst.dayOfWeek) ?? [];
    arr.push(inst);
    byDay.set(inst.dayOfWeek, arr);
  }
  for (const [dow, list] of byDay) {
    const dayIdx = days.indexOf(dow);
    if (dayIdx === -1) continue;
    const sorted = [...list].sort((a, b) => a.startSlot - b.startSlot);
    const laneEnds: number[] = [];
    const lanes = sorted.map((inst) => {
      let lane = laneEnds.findIndex((end) => inst.startSlot > end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(inst.endSlot);
      } else {
        laneEnds[lane] = inst.endSlot;
      }
      return lane;
    });
    const laneCount = Math.max(1, laneEnds.length);

    sorted.forEach((inst, idx) => {
      const lane = lanes[idx] ?? 0;
      const colorId = isCourseColor(inst.color) ? inst.color : "graphite";
      const rgb = parseRgb(cssVar(`--course-${colorId}`) || "100 116 139");
      const x = gridLeft + dayIdx * DAY_W + (lane * DAY_W) / laneCount + 3;
      const w = DAY_W / laneCount - 6;
      const y = gridTop + (inst.startSlot - 1) * ROW_H + 3;
      const h = (inst.endSlot - inst.startSlot + 1) * ROW_H - 6;

      ctx.fillStyle = mix(rgb, card, inst.variant === "cancelled" ? 0.06 : 0.14);
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb.join(",")},0.4)`;
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();

      ctx.save();
      roundRect(ctx, x, y, w, h, 8);
      ctx.clip();
      if (inst.variant === "cancelled") ctx.globalAlpha = 0.55;
      ctx.fillStyle = `rgb(${rgb.join(",")})`;
      ctx.font = font(14, "600");
      const name = (inst.variant === "cancelled" ? "（停课）" : "") + inst.courseName;
      wrapText(ctx, name, x + 8, y + 22, w - 16, 18);
      ctx.globalAlpha *= 0.8;
      ctx.font = font(11);
      let textY = y + 22 + 18 + 6;
      if (inst.room) {
        ctx.fillText(`@${inst.room}`, x + 8, textY);
        textY += 15;
      }
      if (h > 100 && inst.teacher) ctx.fillText(inst.teacher, x + 8, textY);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  // 页脚
  ctx.fillStyle = mix(mutedFg, background, 0.8);
  ctx.font = font(11);
  ctx.textAlign = "right";
  ctx.fillText(
    `共 ${opts.semester.totalWeeks} 教学周 · 由 CampusFlow 生成`,
    12 + TIME_W + days.length * DAY_W,
    gridTop + opts.slots.length * ROW_H + 28,
  );
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 编码失败"));
    }, "image/png");
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  let line = "";
  let currentY = y;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      ctx.fillText(line, x, currentY);
      line = ch;
      currentY += lineHeight;
      if (currentY > y + lineHeight * 2) return; // 最多三行
    } else {
      line += ch;
    }
  }
  ctx.fillText(line, x, currentY);
}

function instDate(semester: Semester, week: number, dayOfWeek: number): string {
  const order = orderedDaysOfWeek(semester.weekStartsOn);
  const idx = order.indexOf(dayOfWeek);
  const d = new Date(`${semester.weekOneAnchor}T00:00:00`);
  d.setDate(d.getDate() + (week - 1) * 7 + Math.max(0, idx));
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
