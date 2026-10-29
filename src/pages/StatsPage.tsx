import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSemesterData } from "@/hooks/useSemesterData";
import { computeSemesterStats } from "@/core/services/stats";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 课程统计页（模块 14）：全部指标由本地 occurrence 引擎实时派生。 */
export function StatsPage() {
  const { semester, slots, courses, sessions, exceptions, loading } = useSemesterData();

  const stats = useMemo(
    () =>
      semester
        ? computeSemesterStats({ semester, slots, courses, sessions, exceptions })
        : null,
    [semester, slots, courses, sessions, exceptions],
  );

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>;
  }
  if (!semester || !stats) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold md:text-2xl">统计</h1>
        </header>
        <EmptyState
          icon={BarChart3}
          title="还没有可统计的数据"
          description="创建学期并添加课程后，这里会展示课时、分布、进度等分析。"
        />
      </div>
    );
  }

  const maxDay = Math.max(1, ...Object.values(stats.histograms.byDay));
  const maxWeek = Math.max(1, ...stats.histograms.byWeek);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold md:text-2xl">统计</h1>
        <p className="text-sm text-muted-foreground">
          {semester.name}
          {stats.currentWeek !== null ? ` · 第 ${stats.currentWeek} 周` : " · 假期中"} · 数据完全本地计算
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="课程数" value={stats.totalCourses} />
        <StatTile label="学期总课时" value={stats.totalSlots} hint="按节数计" />
        <StatTile
          label="教学进度"
          value={`${Math.round(stats.completedWeekRatio * 100)}%`}
          hint={stats.currentWeek !== null ? `已完成 ${Math.max(0, stats.currentWeek - 1)} / ${semester.totalWeeks} 周` : undefined}
        />
        <StatTile label="剩余课次" value={stats.remainingOccurrences} hint="自今天起（不含已停课）" />
      </div>

      {/* 星期分布 */}
      <Card>
        <CardHeader>
          <CardTitle>每星期课程分布</CardTitle>
          <CardDescription>
            最忙：{stats.busiestDay !== null ? DAY_NAMES[stats.busiestDay - 1] : "—"} · 最空闲：
            {stats.freestDay !== null ? DAY_NAMES[stats.freestDay - 1] : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-36 items-end gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const count = stats.histograms.byDay[d] ?? 0;
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
                  <div
                    className="w-full rounded-t-md bg-primary/70"
                    style={{ height: `${(count / maxDay) * 100}%`, minHeight: count > 0 ? 4 : 1 }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {semester.weekStartsOn === 1 ? DAY_NAMES[d - 1] : DAY_NAMES[(d + 5) % 7]}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 每周密度 */}
        <Card>
          <CardHeader>
            <CardTitle>每周课次密度</CardTitle>
            <CardDescription>单双周与调停补课的真实结果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-1">
              {stats.histograms.byWeek.map((count, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`第 ${i + 1} 周：${count} 课次`}>
                  <div
                    className={cn(
                      "w-full rounded-t",
                      i + 1 === stats.currentWeek ? "bg-accent" : "bg-primary/50",
                    )}
                    style={{ height: `${Math.max(2, (count / maxWeek) * 80)}px` }}
                  />
                  {(i + 1) % 4 === 0 || i === 0 ? (
                    <span className="text-[8px] tabular-nums text-muted-foreground">{i + 1}</span>
                  ) : (
                    <span className="h-[10px]" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 时段与例外 */}
        <Card>
          <CardHeader>
            <CardTitle>时段与变更</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">上午 {stats.timeSplit.morning}</Badge>
              <Badge variant="secondary">下午 {stats.timeSplit.afternoon}</Badge>
              <Badge variant="secondary">晚间 {stats.timeSplit.evening}</Badge>
              <Badge variant="accent">早八 {stats.timeSplit.earlyFirst}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">调课 {stats.adjustCount}</Badge>
              <Badge variant="outline">停课 {stats.cancelCount}</Badge>
              <Badge variant="outline">补课 {stats.extraCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 每门课 */}
      <Card>
        <CardHeader>
          <CardTitle>各课程教学时长</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {stats.perCourse.map((c) => (
              <li key={c.courseId} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate font-medium">{c.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: `${
                        stats.totalSlots > 0 ? (c.slotsTotal / Math.max(...stats.perCourse.map((x) => x.slotsTotal), 1)) * 100 : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                  {c.slotsTotal} 节
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {c.weeks.length} 周
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
