import { create } from "zustand";

/** 一条可撤销操作：undo() 由数据层生成（恢复删除前的快照）。 */
export interface UndoEntry {
  id: string;
  /** 展示文案，如“已删除课程「高等数学」” */
  label: string;
  undo: () => Promise<void>;
  expiresAt: number;
}

interface UndoState {
  current: UndoEntry | null;
  push: (entry: Omit<UndoEntry, "expiresAt">, ttlMs?: number) => void;
  consume: () => UndoEntry | null;
  clear: () => void;
}

const DEFAULT_TTL = 8_000;

/**
 * 全局撤销栈（单条，后进覆盖）。
 * 覆盖删除、批量删除等危险操作；快照恢复由仓库层实现，不持久化。
 */
export const useUndoStore = create<UndoState>()((set, get) => ({
  current: null,
  push: (entry, ttlMs = DEFAULT_TTL) => {
    set({ current: { ...entry, expiresAt: Date.now() + ttlMs } });
    const expiresAt = get().current?.expiresAt;
    if (expiresAt !== undefined) {
      window.setTimeout(() => {
        const cur = get().current;
        if (cur && cur.expiresAt <= Date.now()) set({ current: null });
      }, ttlMs + 50);
    }
  },
  consume: () => {
    const entry = get().current;
    set({ current: null });
    return entry;
  },
  clear: () => set({ current: null }),
}));
