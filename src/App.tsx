import { MotionConfig } from "framer-motion";
import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DecorationsLayer } from "@/components/system/DecorationsLayer";
import { NotificationScheduler } from "@/components/system/NotificationScheduler";
import { OnboardingDialog, needsOnboarding } from "@/components/system/OnboardingDialog";
import { AgendaPage } from "@/pages/AgendaPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { SemesterPage } from "@/pages/SemesterPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StatsPage } from "@/pages/StatsPage";

/** 新手引导门（模块 19 #1）：首启（无标记且无学期）时弹出三步向导。 */
function OnboardingGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void needsOnboarding().then(setOpen);
  }, []);
  return <OnboardingDialog open={open} onClose={() => setOpen(false)} />;
}

/**
 * 路由采用 HashRouter：
 * 同一套构建产物可直接用于 Cloudflare Pages（无需 _redirects）、
 * Tauri（tauri:// 协议）与 Capacitor（file:// 场景），跨平台最稳。
 */
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DecorationsLayer />
      <NotificationScheduler />
      <OnboardingGate />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/semester" element={<SemesterPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MotionConfig>
  );
}
