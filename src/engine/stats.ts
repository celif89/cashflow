import { daysInMonth, monthOf, parseDay } from "./dates";
import { fromGr, toGr } from "./money";
import type { Category, Kind, Transaction } from "./types";

export interface Totals { expense: number; income: number; balance: number; count: number }

export function totals(txs: Transaction[]): Totals {
  let e = 0, i = 0;
  for (const t of txs) {
    if (t.kind === "expense") e += toGr(t.amount);
    else i += toGr(t.amount);
  }
  return { expense: fromGr(e), income: fromGr(i), balance: fromGr(i - e), count: txs.length };
}

export const inMonth = (txs: Transaction[], month: string) => txs.filter((t) => monthOf(t.day) === month);

export interface CategoryTotal {
  category: Category | null; // null = bez kategorii
  amount: number;
  count: number;
  share: number; // 0–1 udział w sumie
}

/** Suma na kategorię (malejąco). */
export function byCategory(txs: Transaction[], categories: Category[], kind: Kind = "expense"): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<number | null, { gr: number; count: number }>();
  let all = 0;
  for (const t of txs) {
    if (t.kind !== kind) continue;
    const key = t.category_id !== null && byId.has(t.category_id) ? t.category_id : null;
    const a = acc.get(key) ?? { gr: 0, count: 0 };
    a.gr += toGr(t.amount);
    a.count += 1;
    acc.set(key, a);
    all += toGr(t.amount);
  }
  return [...acc.entries()]
    .map(([id, a]) => ({ category: id === null ? null : byId.get(id)!, amount: fromGr(a.gr), count: a.count, share: all ? a.gr / all : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface MonthPoint { month: string; expense: number; income: number; balance: number }

export function monthly(txs: Transaction[], months: string[], categoryId?: number | null): MonthPoint[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const e = months.map(() => 0), inc = months.map(() => 0);
  for (const t of txs) {
    if (categoryId !== undefined && t.category_id !== categoryId) continue;
    const i = idx.get(monthOf(t.day));
    if (i === undefined) continue;
    if (t.kind === "expense") e[i] += toGr(t.amount);
    else inc[i] += toGr(t.amount);
  }
  return months.map((month, i) => ({ month, expense: fromGr(e[i]), income: fromGr(inc[i]), balance: fromGr(inc[i] - e[i]) }));
}

export interface CumulativePoint { day: number; current: number | null; previous: number | null }

/**
 * Narastające wydatki dzień po dniu: bieżący miesiąc (do `uptoDay`) i poprzedni (cały).
 * Pozwala zobaczyć, czy w tym miesiącu wydajemy szybciej niż w poprzednim.
 */
export function cumulative(txs: Transaction[], month: string, prevMonth: string, uptoDay: number): CumulativePoint[] {
  const len = Math.max(daysInMonth(month), daysInMonth(prevMonth));
  const cur = Array(len + 1).fill(0), prev = Array(len + 1).fill(0);
  for (const t of txs) {
    if (t.kind !== "expense") continue;
    const m = monthOf(t.day);
    const d = parseDay(t.day).getDate();
    if (m === month) cur[d] += toGr(t.amount);
    else if (m === prevMonth) prev[d] += toGr(t.amount);
  }
  const out: CumulativePoint[] = [];
  let c = 0, p = 0;
  for (let d = 1; d <= len; d++) {
    c += cur[d];
    p += prev[d];
    out.push({
      day: d,
      current: d <= Math.min(uptoDay, daysInMonth(month)) ? fromGr(c) : null,
      previous: d <= daysInMonth(prevMonth) ? fromGr(p) : null,
    });
  }
  return out;
}

export interface MerchantTotal { merchant: string; amount: number; count: number }

/** Najczęstsze sklepy – nazwy porównywane bez wielkości liter i polskich znaków. */
export function topMerchants(txs: Transaction[], limit = 8): MerchantTotal[] {
  const acc = new Map<string, { name: string; gr: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== "expense" || !t.merchant?.trim()) continue;
    const key = fold(t.merchant);
    const a = acc.get(key) ?? { name: t.merchant.trim(), gr: 0, count: 0 };
    a.gr += toGr(t.amount);
    a.count += 1;
    acc.set(key, a);
  }
  return [...acc.values()]
    .map((a) => ({ merchant: a.name, amount: fromGr(a.gr), count: a.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, " ").trim();

export interface BudgetRow { category: Category; spent: number; limit: number; ratio: number }

/** Kategorie z limitem miesięcznym i stopień jego wykorzystania (najbardziej przekroczone najpierw). */
export function budgets(monthTxs: Transaction[], categories: Category[]): BudgetRow[] {
  const spent = new Map(byCategory(monthTxs, categories).map((r) => [r.category?.id ?? null, r.amount]));
  return categories
    .filter((c) => c.kind === "expense" && c.monthly_limit && !c.archived)
    .map((c) => {
      const s = spent.get(c.id) ?? 0;
      return { category: c, spent: s, limit: c.monthly_limit!, ratio: s / c.monthly_limit! };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Prognoza wydatków na koniec miesiąca przy obecnym tempie (null na początku miesiąca – za mało danych). */
export function forecast(spent: number, month: string, uptoDay: number): number | null {
  if (uptoDay < 5) return null;
  const len = daysInMonth(month);
  if (uptoDay >= len) return spent;
  return Math.round((spent / uptoDay) * len);
}

export interface Slice { key: string; name: string; amount: number; share: number; color: string; category: Category | null; others?: number }

/**
 * Kawałki wykresu kołowego: do 6 kategorii, przy większej liczbie 5 największych + „Pozostałe”.
 * Kolor to kolor kategorii; gdy dwie pokazane kategorie mają ten sam, druga dostaje
 * pierwszy wolny kolor z palety (żeby kawałków nie dało się pomylić).
 */
export function donutSlices(rows: CategoryTotal[], palette: string[], max = 6): Slice[] {
  const top = rows.length <= max ? rows : rows.slice(0, max - 1);
  const rest = rows.slice(top.length);
  const used = new Set<string>();
  const pick = (want: string | null) => {
    const c = want && !used.has(want.toLowerCase()) ? want : palette.find((p) => !used.has(p.toLowerCase())) ?? "#94a3b8";
    used.add(c.toLowerCase());
    return c;
  };
  const slices: Slice[] = top.map((r) => ({
    key: String(r.category?.id ?? "none"), name: r.category?.name ?? "Bez kategorii", amount: r.amount, share: r.share,
    category: r.category, color: pick(r.category ? r.category.color : "#64748b"),
  }));
  if (rest.length) {
    slices.push({
      key: "rest", name: "Pozostałe", category: null, others: rest.length, color: "#94a3b8",
      amount: fromGr(rest.reduce((a, r) => a + toGr(r.amount), 0)), share: rest.reduce((a, r) => a + r.share, 0),
    });
  }
  return slices;
}
