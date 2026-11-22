// Ostrzeżenie przed podwójnym wpisem: ten sam wydatek drugi raz w tym samym miesiącu.
// Biedronka kilka razy w miesiącu to norma, więc ostrzegamy tylko w trzech przypadkach.
import { monthOf, parseDay } from "./dates";
import { toGr } from "./money";
import { fold } from "./stats";
import type { Kind, Receipt, Recurring, Transaction } from "./types";

export interface Candidate {
  day: string;
  amount: number | null;
  kind: Kind;
  merchant: string | null;
  category_id: number | null;
  /** przy edycji – sama siebie nie jest duplikatem */
  excludeId?: number;
}

export type Duplicate =
  /** ten sam sklep (albo bez sklepu: ta sama kategoria tego samego dnia) i ta sama kwota */
  | { reason: "same"; items: Transaction[] }
  /** stała płatność, która w tym miesiącu już jest (zapisana albo czeka na zatwierdzenie) */
  | { reason: "recurring"; recurring: Recurring; items: Transaction[] }
  /** sklep, w którym zwykle płacisz raz w miesiącu */
  | { reason: "monthly"; items: Transaction[] };

const key = (s: string | null | undefined) => fold(s ?? "");

/** Sklep, w którym w historii płacisz raz w miesiącu: co najmniej 2 miesiące i nigdy dwa razy w jednym. */
function oncePerMonth(mk: string, kind: Kind, txs: Transaction[], skipMonth: string): boolean {
  const perMonth = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== kind || key(t.merchant) !== mk || t.status === "pending") continue;
    const m = monthOf(t.day);
    if (m === skipMonth) continue;
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
  }
  return perMonth.size >= 2 && [...perMonth.values()].every((n) => n === 1);
}

export function findDuplicate(c: Candidate, txs: Transaction[], recurring: Recurring[]): Duplicate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.day)) return null;
  const month = monthOf(c.day);
  const mk = key(c.merchant);
  const sameMonth = txs.filter((t) => t.id !== c.excludeId && t.kind === c.kind && monthOf(t.day) === month);
  const byDay = (a: Transaction, b: Transaction) => a.day.localeCompare(b.day);

  // 1. stała płatność rozpoznana po nazwie/odbiorcy
  if (mk.length >= 3) {
    const r = recurring.find((x) => x.kind === c.kind && [key(x.merchant), key(x.name)].some((k) => k.length >= 3 && (k === mk || ` ${mk} `.includes(` ${k} `) || ` ${k} `.includes(` ${mk} `))));
    if (r) {
      const items = sameMonth.filter((t) => t.recurring_id === r.id || key(t.merchant) === mk).sort(byDay);
      if (items.length) return { reason: "recurring", recurring: r, items };
    }
  }

  // 2. ta sama kwota u tego samego sklepu (bez sklepu: ta sama kategoria tego samego dnia)
  if (c.amount !== null && c.amount > 0) {
    const gr = toGr(c.amount);
    const items = sameMonth.filter((t) => toGr(t.amount) === gr && (mk
      ? key(t.merchant) === mk
      : !t.merchant && c.category_id !== null && t.category_id === c.category_id && t.day === c.day)).sort(byDay);
    if (items.length) return { reason: "same", items };
  }

  // 3. sklep „raz w miesiącu” (abonament, rachunek), choć nie ma go na liście stałych płatności
  if (mk.length >= 3) {
    const items = sameMonth.filter((t) => key(t.merchant) === mk).sort(byDay);
    if (items.length && oncePerMonth(mk, c.kind, txs.filter((t) => t.id !== c.excludeId), month)) return { reason: "monthly", items };
  }
  return null;
}

/** Ten sam paragon zeskanowany drugi raz: ta sama suma, ten sam sklep (albo brak nazwy), najwyżej dzień różnicy. */
export function sameReceipt(r: { day: string; total: number | null; merchant: string | null }, receipts: Receipt[]): Receipt | null {
  if (!r.total || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const gr = toGr(r.total), mk = key(r.merchant);
  return receipts.find((x) => toGr(x.total) === gr
    && Math.abs(parseDay(x.day).getTime() - parseDay(r.day).getTime()) <= 86400000 * 1.5
    && (!mk || !x.merchant || key(x.merchant) === mk)) ?? null;
}
