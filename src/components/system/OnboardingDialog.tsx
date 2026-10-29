import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Database, GraduationCap, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { db } from "@/core/db/dexie";
import { buttonVariants } from "@/components/ui/button";

const ONBOARDING_KEY = "onboardingDone";

/** 是否已完成新手引导（首启检测：无标记且无学期）。 */
export async function needsOnboarding(): Promise<boolean> {
  const done = await db.preferences.get(ONBOARDING_KEY);
  if (done) return false;
  const count = await db.semesters.count();
  return count === 0;
}

export async function finishOnboarding(): Promise<void> {
  await db.preferences.put({ key: ONBOARDING_KEY, value: true, updatedAt: Date.now() });
}

/** 新手引导（模块 19 #1-3）：三步向导，完成或跳过后不再出现。 */
export function OnboardingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const hasSemester = useLiveQuery(() => db.semesters.count(), []);

  const steps = [
    {
      title: "欢迎使用 CampusFlow",
      icon: GraduationCap,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>为中国大学生设计的跨平台课程表：准确处理教学周、单双周、指定周与调课补课。</p>
          <ul className="list-inside list-disc space-y-1">
            <li>所有数据只保存在本机，离线可用，无需注册</li>
            <li>教学周按你设定的开学日期推算，单双周不混淆</li>
            <li>支持 Web/PWA、Windows、Android、iOS</li>
          </ul>
        </div>
      ),
    },
    {
      title: "第一步：创建学期",
      icon: CalendarDays,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>到「学期」页创建学期：填写名称、开学日期与教学周数即可。</p>
          <p>第一周起始日会自动推算（如周二开学默认该周周一），节次时间默认 12 节常见作息，可自由修改。</p>
          {hasSemester ? (
            <p className="flex items-center gap-1.5 font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              已有学期，可跳过此步
            </p>
          ) : (
            <Link to="/semester" className={buttonVariants({ size: "sm" })} onClick={onClose}>
              前往学期页
            </Link>
          )}
        </div>
      ),
    },
    {
      title: "第二步：添加课程",
      icon: Database,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>点击课表空白格可快速新建（自动填好星期与节次），或用「导入」从 CSV/Excel/粘贴文本批量导入。</p>
          <p>之后可以：调课/停课/补课（不动重复规则）、多套课表、考试倒计时、上课提醒、统计与导出。</p>
          <p className="text-xs">提示：随时可在 设置 → 使用帮助 查看完整说明。</p>
        </div>
      ),
    },
  ];

  const StepIcon = steps[step]!.icon;

  return (
    <Dialog
      open={open}
      onClose={() => {
        void finishOnboarding();
        onClose();
      }}
      title={`新手引导（${step + 1}/3）`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              void finishOnboarding();
              onClose();
            }}
          >
            跳过
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)}>下一步</Button>
          ) : (
            <Button
              onClick={() => {
                void finishOnboarding();
                onClose();
              }}
            >
              开始使用
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <StepIcon className="h-5.5 w-5.5" />
          </div>
          <p className="text-base font-semibold">{steps[step]!.title}</p>
        </div>
        {steps[step]!.body}
      </div>
    </Dialog>
  );
}
