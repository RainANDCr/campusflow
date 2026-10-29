import { useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { buildSharePayload } from "@/core/services/textImport";
import type { CourseInstance } from "@/core/services/schedule";
import type { CourseSession } from "@/core/models";

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  instances: CourseInstance[];
  /** 原始排课（用于精确还原周次规则） */
  sessions: CourseSession[];
  title: string;
}

/**
 * 课表分享（模块 03 #23 / 模块 12 #10 的本地部分）：
 * 生成脱敏二维码与可复制的分享文本；接收方在「导入课程 → 粘贴文本 / 分享码」中粘贴即可导入。
 * 纯本地生成，无服务端、无短链。
 */
export function ShareDialog({
  open,
  onClose,
  instances,
  sessions,
  title,
}: ShareDialogProps) {
  const [hideRoom, setHideRoom] = useState(false);
  const [hideTeacher, setHideTeacher] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 按课程+星期+节次去重；周规则从原始 session 精确还原
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const entries = instances
    .filter((i) => i.variant !== "cancelled" && i.variant !== "moved-away")
    .filter((i) => {
      const key = `${i.courseName}|${i.dayOfWeek}|${i.startSlot}|${i.endSlot}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((i) => ({
      name: i.courseName,
      dayOfWeek: i.dayOfWeek,
      startSlot: i.startSlot,
      endSlot: i.endSlot,
      weekRule:
        (i.sessionId ? sessionById.get(i.sessionId)?.weekRule : undefined) ??
        { type: "all" as const },
      room: hideRoom ? undefined : i.room,
      teacher: hideTeacher ? undefined : i.teacher,
    }));

  const generate = async () => {
    setError(null);
    try {
      const payload = buildSharePayload(entries);
      const url = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
      });
      setQrDataUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "二维码生成失败");
    }
  };

  const payloadText = (() => {
    try {
      return buildSharePayload(entries);
    } catch {
      return "";
    }
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="分享课表"
      description={`${title} · 本地生成二维码，无服务端参与`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => void generate()} disabled={entries.length === 0}>
            生成二维码
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          将分享 {entries.length} 个课次安排（含精确周次规则）
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideRoom}
              onChange={(e) => setHideRoom(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            隐藏教室
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideTeacher}
              onChange={(e) => setHideTeacher(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            隐藏教师
          </label>
        </div>

        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="课表分享二维码" className="h-56 w-56" />
            <p className="text-xs text-muted-foreground">
              对方扫码后把文本粘贴到「导入课程 → 粘贴文本 / 分享码」
            </p>
          </div>
        ) : null}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void navigator.clipboard
              .writeText(payloadText)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "已复制分享文本" : "复制分享文本"}
        </Button>
      </div>
    </Dialog>
  );
}
