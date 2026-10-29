import { useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface LongPressResult {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerMove: (e: ReactPointerEvent) => void;
}

/**
 * 移动端长按手势（模块 02 #17）：默认 500ms 触发；
 * 移动超过 10px 视为滚动意图并取消，不与纵向滚动冲突。
 * onLongPress 收到触发位置（用于定位操作菜单）。
 */
export function useLongPress(
  onLongPress: (position: { x: number; y: number }) => void,
  enabled = true,
  durationMs = 500,
): LongPressResult {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: (e) => {
      if (!enabled) return;
      // 仅触摸/触控笔长按；鼠标用右键菜单（onContextMenu）
      if (e.pointerType === "mouse" || e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        onLongPress({ x: e.clientX, y: e.clientY });
      }, durationMs);
    },
    onPointerMove: (e) => {
      if (timer.current === null || origin.current === null) return;
      const dx = Math.abs(e.clientX - origin.current.x);
      const dy = Math.abs(e.clientY - origin.current.y);
      if (dx > 10 || dy > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
  };
}
