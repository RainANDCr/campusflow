import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** 应用内使用帮助（模块 19 #24）：快速指南 + 完整文档位置说明。 */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"quick" | "privacy">("quick");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="使用帮助"
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="inline-flex rounded-xl bg-muted p-1">
          {(
            [
              ["quick", "快速指南"],
              ["privacy", "数据与隐私"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              aria-pressed={tab === v}
              onClick={() => setTab(v)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                tab === v ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "quick" ? (
          <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
            <li>切周：左右按钮 / 键盘 ←→ / 触屏滑动；T 键回本周</li>
            <li>长按（手机）或右键（电脑）课程卡：调课 / 停课 / 编辑</li>
            <li>点击课表空白格：以该时段快速新建课程</li>
            <li>节假日：课表页右上角「节假日课程调整」批量停课</li>
            <li>多套课表：学期页可为每个学期建备选方案并随时切换</li>
            <li>导入：设置 → 导入 CSV/XLSX，或直接粘贴文本/分享码</li>
            <li>提醒：设置 → 通知 授权后生效；每门课可单独覆盖提前量</li>
            <li>桌面快捷键：← → 切周、T 回本周；课程详情里地点可一键复制</li>
          </ul>
        ) : (
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p>· 所有数据只保存在本机 IndexedDB，应用不上传任何信息。</p>
            <p>· 换设备：设置 → 导出 JSON 备份 → 在新设备导入（可选密码加密）。</p>
            <p>· 自动备份：每 24 小时在本机保留最近 3 份快照，可在下方恢复。</p>
            <p>· 清除浏览器数据会删除课表，请定期导出备份。</p>
            <p>· 完整文档见项目 docs/USER-GUIDE.md。</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
