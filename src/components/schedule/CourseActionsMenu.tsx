import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CourseInstance } from "@/core/services/schedule";

export interface CourseActionsMenuProps {
  inst: CourseInstance;
  position: { x: number; y: number };
  onClose: () => void;
  onView: (inst: CourseInstance) => void;
  onEdit: (courseId: string) => void;
  onAdjust: (inst: CourseInstance) => void;
  onCancelClass: (inst: CourseInstance) => void;
}

/**
 * 课程快捷操作菜单（模块 02 #17）：移动端长按 / 桌面右键等价入口。
 * 动作复用既有弹窗流程，不引入新数据路径。
 */
export function CourseActionsMenu({
  inst,
  position,
  onClose,
  onView,
  onEdit,
  onAdjust,
  onCancelClass,
}: CourseActionsMenuProps) {
  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-course-menu]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 防止菜单溢出视口
  const x = Math.min(position.x, window.innerWidth - 160);
  const y = Math.min(position.y, window.innerHeight - 260);

  const actions: Array<{
    label: string;
    run: () => void;
    danger?: boolean;
    disabled?: boolean;
  }> = [
    { label: "查看详情", run: () => onView(inst) },
    { label: "编辑课程", run: () => onEdit(inst.courseId) },
    {
      label: "调课（本次）",
      run: () => onAdjust(inst),
      disabled: inst.sessionId === "",
    },
    {
      label: "停课（本次）",
      run: () => onCancelClass(inst),
      disabled: inst.sessionId === "",
      danger: true,
    },
  ];

  return createPortal(
    <div
      data-course-menu
      role="menu"
      aria-label="课程快捷操作"
      className="fixed z-50 w-40 overflow-hidden rounded-xl border bg-card py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          disabled={"disabled" in a && a.disabled}
          onClick={() => {
            a.run();
            onClose();
          }}
          className={`block w-full px-3.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-40 ${
            a.danger ? "text-destructive" : ""
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
