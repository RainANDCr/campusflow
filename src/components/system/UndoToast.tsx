import { AnimatePresence, motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useUndoStore } from "@/stores/undoStore";

/** 全局撤销提示条：危险操作后短暂出现，点「撤销」恢复快照。 */
export function UndoToast() {
  const current = useUndoStore((s) => s.current);
  const consume = useUndoStore((s) => s.consume);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(current !== null);
  }, [current]);

  const handleUndo = () => {
    const entry = consume();
    if (entry) void entry.undo();
  };

  return (
    <AnimatePresence>
      {visible && current ? (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18 }}
          className="no-print fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-lg md:bottom-6"
        >
          <span className="text-sm">{current.label}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <Undo2 className="h-3.5 w-3.5" />
            撤销
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
