import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Category, Kind } from "../engine/types";
import { type AppData, loadAll } from "./data";

interface DataState {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  categoryById: Map<number, Category>;
  /** aktywne kategorie danego rodzaju, w kolejności użytkownika */
  activeCategories: (kind: Kind) => Category[];
  /** podpowiedzi sklepów: od najczęstszych */
  merchants: string[];
  /** okno dodawania/edycji transakcji (dostępne z każdej strony) */
  editor: EditorState | null;
  openEditor: (e?: EditorState) => void;
  closeEditor: () => void;
}

export interface EditorState { id?: number; kind?: Kind; day?: string }

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const openEditor = useCallback((e: EditorState = {}) => setEditor(e), []);
  const closeEditor = useCallback(() => setEditor(null), []);

  const value = useMemo<DataState>(() => {
    const categories = data?.categories ?? [];
    const counts = new Map<string, { name: string; n: number }>();
    for (const t of data?.transactions ?? []) {
      const m = t.merchant?.trim();
      if (!m) continue;
      const k = m.toLowerCase();
      const c = counts.get(k) ?? { name: m, n: 0 };
      c.n++;
      counts.set(k, c);
    }
    return {
      data, loading, error, reload, editor, openEditor, closeEditor,
      categoryById: new Map(categories.map((c) => [c.id, c])),
      activeCategories: (kind: Kind) => categories.filter((c) => c.kind === kind && !c.archived),
      merchants: [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name),
    };
  }, [data, loading, error, reload, editor, openEditor, closeEditor]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData poza DataProvider");
  return v;
}
