import { round2, sum, toGr } from "./money";
import type { Category, NewTransaction, ReceiptItem, ScanResult } from "./types";

/** Odpowiedź funkcji → poprawny wynik: kwoty dodatnie, znane kategorie, sensowna data. */
export function sanitizeScan(raw: ScanResult, categories: Category[], fallbackDay: string): ScanResult {
  const allowed = new Set(categories.filter((c) => c.kind === "expense" && !c.archived).map((c) => c.id));
  const items = (raw.items ?? [])
    .map((it) => ({
      name: String(it.name ?? "").trim() || "Pozycja",
      amount: round2(Number(it.amount) || 0),
      category_id: it.category_id !== null && allowed.has(Number(it.category_id)) ? Number(it.category_id) : null,
    }))
    .filter((it) => it.amount !== 0);
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && raw.date <= fallbackDay ? raw.date : fallbackDay;
  const total = round2(Number(raw.total) || sum(items.map((i) => i.amount)));
  return { merchant: raw.merchant?.trim() || null, date, total, items };
}

/** Różnica między sumą pozycji a kwotą „SUMA PLN” (0 = zgadza się). */
export const itemsGap = (r: { total: number; items: ReceiptItem[] }) => round2(r.total - sum(r.items.map((i) => i.amount)));

export interface ReceiptGroup { category_id: number | null; amount: number; items: ReceiptItem[] }

/**
 * Grupuje pozycje paragonu po kategoriach. Rabaty (ujemne pozycje) zostają w swojej kategorii;
 * różnicę między sumą pozycji a sumą paragonu dopisuje do największej grupy, żeby
 * transakcje razem dały dokładnie kwotę z paragonu.
 */
export function groupByCategory(r: { total: number; items: ReceiptItem[] }): ReceiptGroup[] {
  const map = new Map<number | null, ReceiptGroup>();
  for (const it of r.items) {
    const g = map.get(it.category_id) ?? { category_id: it.category_id, amount: 0, items: [] };
    g.amount = round2(g.amount + it.amount);
    g.items.push(it);
    map.set(it.category_id, g);
  }
  const groups = [...map.values()].sort((a, b) => b.amount - a.amount);
  const gap = itemsGap(r);
  if (groups.length && gap !== 0) groups[0].amount = round2(groups[0].amount + gap);
  return groups.filter((g) => toGr(g.amount) > 0);
}

/** Transakcje do zapisania: jedna na kategorię albo jedna na cały paragon. */
export function receiptTransactions(
  r: { total: number; items: ReceiptItem[]; merchant: string | null; day: string },
  split: boolean,
  categories: Category[],
  fallbackCategory: number | null,
): Omit<NewTransaction, "receipt_id">[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const note = (items: ReceiptItem[]) => {
    const list = items.map((i) => i.name).join(", ");
    return list.length > 300 ? `${list.slice(0, 297)}…` : list || null;
  };
  if (!split || r.items.length === 0) {
    const main = groupByCategory(r)[0]?.category_id ?? fallbackCategory;
    return [{ day: r.day, amount: round2(r.total), kind: "expense", category_id: main, merchant: r.merchant, note: note(r.items) }];
  }
  return groupByCategory(r).map((g) => ({
    day: r.day,
    amount: g.amount,
    kind: "expense" as const,
    category_id: g.category_id ?? fallbackCategory,
    merchant: r.merchant,
    note: note(g.items) ?? (g.category_id ? names.get(g.category_id) ?? null : null),
  }));
}
