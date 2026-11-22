// Stałe płatności: terminy, brakujące płatności do zatwierdzenia, najbliższe płatności.
import { addMonths, daysInMonth, parseDay } from "./dates";
import { toGr } from "./money";
import { fold } from "./stats";
import type { Recurring, Transaction } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** n-ty termin (od 0): ten sam dzień miesiąca, a w krótszym miesiącu – jego ostatni dzień. */
export function nthDue(r: Pick<Recurring, "start_date" | "every_months">, n: number): string {
  const month = addMonths(r.start_date.slice(0, 7), n * r.every_months);
  const day = Math.min(Number(r.start_date.slice(8, 10)), daysInMonth(month));
  return `${month}-${pad(day)}`;
}

/** Terminy w przedziale [from, to] (włącznie), z uwzględnieniem daty końca. */
export function dueDates(r: Pick<Recurring, "start_date" | "every_months" | "end_date">, from: string, to: string, limit = 400): string[] {
  const out: string[] = [];
  for (let n = 0; n < limit; n++) {
    const d = nthDue(r, n);
    if (d > to || (r.end_date && d > r.end_date)) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export const recurringRef = (id: number, due: string) => `rec:${id}:${due}`;

/** Odcisk pozycji do zatwierdzenia: linia wyciągu albo termin stałej płatności. */
export const refOf = (t: Transaction): string | null =>
  t.bank_ref ?? (t.recurring_id && t.recurring_due ? recurringRef(t.recurring_id, t.recurring_due) : null);

/**
 * Terminy, które już minęły (do dziś włącznie), a nie ma ich jeszcze w aplikacji ani nie zostały
 * pominięte. Najwyżej `maxBack` ostatnich na pozycję – żeby data startu sprzed lat nie zasypała listy.
 */
export function missingDues(list: Recurring[], txs: Transaction[], refs: Set<string>, today: string, maxBack = 12): { r: Recurring; due: string }[] {
  const have = new Set<string>();
  for (const t of txs) if (t.recurring_id && t.recurring_due) have.add(recurringRef(t.recurring_id, t.recurring_due));
  const out: { r: Recurring; due: string }[] = [];
  for (const r of list) {
    if (!r.active) continue;
    const dues = dueDates(r, r.start_date, today).filter((d) => !have.has(recurringRef(r.id, d)) && !refs.has(recurringRef(r.id, d)));
    for (const due of dues.slice(-maxBack)) out.push({ r, due });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Najbliższe płatności w przedziale (from, to] – do podglądu „co jeszcze przede mną”. */
export function upcoming(list: Recurring[], from: string, to: string): { r: Recurring; due: string }[] {
  const out: { r: Recurring; due: string }[] = [];
  for (const r of list) {
    if (!r.active) continue;
    for (const due of dueDates(r, from, to)) if (due > from) out.push({ r, due });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || b.r.amount - a.r.amount);
}

/** Następny termin od `from` włącznie (null, gdy pozycja się skończyła). */
export function nextDue(r: Recurring, from: string): string | null {
  return dueDates(r, from, "2100-12-31", 1200)[0] ?? null;
}

const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

export const FREQUENCIES: { value: number; label: string }[] = [
  { value: 1, label: "co miesiąc" },
  { value: 2, label: "co 2 miesiące" },
  { value: 3, label: "co kwartał" },
  { value: 6, label: "co pół roku" },
  { value: 12, label: "co rok" },
];

/** „co miesiąc, 15. dnia”, „co kwartał: 10 sty, kwi, lip, paź”, „co rok, 15 marca” */
export function frequencyLabel(r: Pick<Recurring, "every_months" | "start_date">): string {
  const day = Number(r.start_date.slice(8, 10));
  const m = Number(r.start_date.slice(5, 7)) - 1;
  const freq = FREQUENCIES.find((f) => f.value === r.every_months)?.label ?? `co ${r.every_months} mies.`;
  const dayText = day >= 29 ? `${day}. dnia (w krótszych miesiącach ostatniego)` : `${day}. dnia`;
  if (r.every_months === 1) return `${freq}, ${dayText}`;
  if (r.every_months === 12) return `${freq}, ${day} ${MONTHS_GEN[m]}`;
  const months = Array.from({ length: 12 / r.every_months }, (_, i) => MONTHS_SHORT[(m + i * r.every_months) % 12]);
  return 12 % r.every_months === 0 ? `${freq}: ${day} ${months.join(", ")}` : `${freq}, ${dayText}`;
}

/** Miesięczny koszt (kwartalny podatek 300 zł → 100 zł/mies.) – do podsumowania stałych opłat. */
export const monthlyCost = (r: Recurring) => r.amount / r.every_months;

const dayDiff = (a: string, b: string) => Math.abs(Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000));

/**
 * Dla płatności ze stałej pozycji czekającej na zatwierdzenie szuka tej samej płatności, która już
 * jest w aplikacji (np. z wyciągu): ta sama kwota – albo przy kwocie zmiennej ta sama kategoria
 * lub sklep – najwyżej 4 dni różnicy. Bierze pod uwagę też pozycje z wyciągu, które jeszcze czekają.
 */
export function matchRecurring(pending: Transaction[], all: Transaction[], list: Recurring[]): Map<number, Transaction> {
  const byId = new Map(list.map((r) => [r.id, r]));
  const out = new Map<number, Transaction>();
  const used = new Set<number>();
  for (const p of pending) {
    if (!p.recurring_id) continue;
    const r = byId.get(p.recurring_id);
    const pm = fold(p.merchant ?? r?.merchant ?? "");
    let best: { t: Transaction; diff: number } | null = null;
    for (const t of all) {
      if (t.id === p.id || t.recurring_id || used.has(t.id) || t.kind !== p.kind) continue;
      if (t.status === "pending" && !t.bank_ref) continue;
      const diff = dayDiff(t.day, p.day);
      if (diff > 4) continue;
      const sameAmount = toGr(t.amount) === toGr(p.amount);
      const similar = r?.variable_amount && ((p.category_id !== null && t.category_id === p.category_id) || (pm.length >= 4 && fold(`${t.merchant ?? ""} ${t.bank_text ?? ""}`).includes(pm)));
      if ((sameAmount || similar) && (!best || diff < best.diff)) best = { t, diff };
    }
    if (best) {
      out.set(p.id, best.t);
      used.add(best.t.id);
    }
  }
  return out;
}

export interface RecurringSuggestion {
  name: string;
  merchantKey: string;
  kind: Transaction["kind"];
  amount: number;
  variable: boolean;
  day: number;
  category_id: number | null;
  months: number;
  lastDay: string;
}

/**
 * Wykrywa w historii płatności, które wyglądają na stałe: ten sam sklep/odbiorca w co najmniej
 * 3 różnych miesiącach z ostatnich 6, raz w miesiącu, o podobnej kwocie (różnica do 15%; większa →
 * „kwota zmienna”, jak rachunek za prąd). Pomija to, co już jest na liście stałych płatności.
 */
export function suggestRecurring(txs: Transaction[], existing: Recurring[], today: string): RecurringSuggestion[] {
  const since = addMonths(today.slice(0, 7), -6);
  const taken = new Set(existing.map((r) => fold(r.merchant || r.name)));
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.status === "pending" || t.recurring_id || t.receipt_id || !t.merchant || t.day.slice(0, 7) < since) continue;
    const key = `${t.kind}|${fold(t.merchant)}`;
    if (fold(t.merchant).length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    const mk = key.slice(key.indexOf("|") + 1);
    if (taken.has(mk)) continue;
    const byMonth = new Map<string, Transaction[]>();
    for (const t of list) byMonth.set(t.day.slice(0, 7), [...(byMonth.get(t.day.slice(0, 7)) ?? []), t]);
    // sklepy odwiedzane kilka razy w miesiącu (Biedronka) to nie stała płatność
    if (byMonth.size < 3 || [...byMonth.values()].some((m) => m.length > 1)) continue;
    const amounts = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const spread = (amounts[amounts.length - 1] - amounts[0]) / median;
    if (spread > 0.6) continue;
    const days = list.map((t) => Number(t.day.slice(8, 10))).sort((a, b) => a - b);
    const cats = new Map<number, number>();
    for (const t of list) if (t.category_id !== null) cats.set(t.category_id, (cats.get(t.category_id) ?? 0) + 1);
    const last = [...list].sort((a, b) => b.day.localeCompare(a.day))[0];
    out.push({
      name: last.merchant!.trim(), merchantKey: mk, kind: last.kind, amount: median, variable: spread > 0.15,
      day: days[Math.floor(days.length / 2)], months: byMonth.size, lastDay: last.day,
      category_id: [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}
