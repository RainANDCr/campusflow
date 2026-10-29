import { useEffect, useState } from "react";

/** 周期性刷新的当前时间（用于“进行中课程”高亮与倒计时）。 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
