import { motion } from "framer-motion";
import { BarChart3, CalendarDays, GraduationCap, ListChecks, Settings } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { UndoToast } from "@/components/system/UndoToast";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "课表", icon: CalendarDays, end: true },
  { to: "/agenda", label: "日程", icon: ListChecks, end: false },
  { to: "/stats", label: "统计", icon: BarChart3, end: false },
  { to: "/semester", label: "学期", icon: GraduationCap, end: false },
  { to: "/settings", label: "设置", icon: Settings, end: false },
] as const;

/**
 * 响应式应用骨架：
 * - 移动端：顶部内容 + 底部导航（含安全区适配）
 * - 桌面端（md+）：左侧导航栏 + 大面积内容区
 * 页面切换使用 Framer Motion 轻量过渡。
 */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground md:flex-row">
      {/* 桌面侧边栏 */}
      <aside className="no-print hidden w-56 shrink-0 flex-col border-r bg-card/60 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">CampusFlow</p>
            <p className="text-xs text-muted-foreground">智能课程表</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4 text-xs text-muted-foreground">
          v0.1.0 · 第一阶段
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8"
          >
            <Outlet />
          </motion.div>
        </main>

        {/* 移动端底部导航 */}
        <nav className="safe-bottom no-print fixed inset-x-0 bottom-0 z-10 flex border-t bg-card/95 backdrop-blur md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <UndoToast />
    </div>
  );
}
