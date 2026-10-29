import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotationSpeed: number;
  alpha: number;
  phase: number;
}

/**
 * 轻二次元装饰层（可开关）：
 * - 深色模式：闪烁星空
 * - 浅色模式：随主题色调漂浮的花瓣
 * Canvas 绘制于内容层之下，pointer-events 关闭，不遮挡任何操作；
 * 系统“减少动态效果”时渲染静态一帧。
 */
export function DecorationsLayer() {
  const decorations = useSettingsStore((s) => s.settings.decorations);
  const themeId = useSettingsStore((s) => s.settings.themeId);
  const mode = useSettingsStore((s) => s.settings.mode);

  useEffect(() => {
    if (!decorations || typeof document === "undefined") return;

    const dark =
      mode === "dark" ||
      (mode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "0",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#3b82f6";

    // 颜色：深色 → 星光；浅色 → 主题花瓣（樱花粉主题偏粉，其余用强调色淡化）
    const petalColor =
      themeId === "sakura"
        ? "rgba(232, 128, 159, 0.5)"
        : themeId === "forest"
          ? "rgba(91, 185, 138, 0.4)"
          : themeId === "mono"
            ? "rgba(140, 140, 150, 0.35)"
            : hexToRgba(accent, 0.4);
    const starColor = "rgba(235, 235, 255, 0.9)";

    const COUNT = dark ? 60 : 26;
    const particles: Particle[] = Array.from({ length: COUNT }, () => spawn(dark));

    function spawn(isDark: boolean): Particle {
      return {
        x: Math.random() * window.innerWidth,
        y: isDark
          ? Math.random() * window.innerHeight
          : Math.random() * -window.innerHeight,
        size: isDark ? 0.8 + Math.random() * 1.6 : 4 + Math.random() * 5,
        speedY: isDark ? 0 : 0.25 + Math.random() * 0.5,
        speedX: isDark ? 0 : 0.15 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      };
    }

    let raf = 0;
    let time = 0;

    const drawFrame = (delta: number) => {
      time += delta;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (dark) {
        for (const p of particles) {
          const twinkle = 0.55 + 0.45 * Math.sin(time * 0.0012 + p.phase);
          ctx.globalAlpha = p.alpha * twinkle;
          ctx.fillStyle = starColor;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (const p of particles) {
          p.x += p.speedX + Math.sin(time * 0.0008 + p.phase) * 0.3;
          p.y += p.speedY;
          p.rotation += p.rotationSpeed;
          if (p.y > window.innerHeight + 20 || p.x > window.innerWidth + 20) {
            Object.assign(p, spawn(false), { x: Math.random() * window.innerWidth * 0.9, y: -20 });
          }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.globalAlpha = p.alpha * 0.8;
          ctx.fillStyle = petalColor;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      drawFrame(0); // 静态一帧
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        canvas.remove();
      };
    }

    let last = performance.now();
    const loop = (t: number) => {
      const delta = t - last;
      last = t;
      drawFrame(delta);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.remove();
    };
  }, [decorations, themeId, mode]);

  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(180, 180, 200, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
