// Odczyt i zapis danych w Supabase (tabele cf_*).
import { DEFAULT_CATEGORIES } from "../engine/defaults";
import type { Category, NewTransaction, Receipt, Transaction } from "../engine/types";
import { supabase } from "./supabase";

export interface AppData {
  categories: Category[];
  /** zatwierdzone – tylko one liczą się do budżetu */
  transactions: Transaction[];
  /** z wyciągu, czekają na zatwierdzenie */
  pending: Transaction[];
  /** odciski linii wyciągu już rozpatrzonych */
  importRefs: Set<string>;
  receipts: Receipt[];
  settings: Record<string, string>;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Supabase zwraca najwyżej 1000 wierszy na zapytanie – pobieramy stronami. */
async function fetchAll<T>(table: string, order: [string, boolean][]): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select("*");
    for (const [col, asc] of order) q = q.order(col, { ascending: asc });
    const rows = check(await q.range(from, from + page - 1)) as (T & { user_id?: string })[];
    out.push(...rows.map(({ user_id: _u, ...r }) => r as T));
    if (rows.length < page) return out;
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadAll(): Promise<AppData> {
  let [categories, transactions, receipts, settings, refs] = await Promise.all([
    fetchAll<Category>("cf_categories", [["position", true], ["id", true]]),
    fetchAll<Transaction>("cf_transactions", [["day", false], ["id", false]]),
    fetchAll<Receipt>("cf_receipts", [["day", false], ["id", false]]),
    fetchAll<{ key: string; value: string }>("cf_settings", [["key", true]]),
    // tabela z wersji 1.1.0 – gdy jeszcze jej nie ma, aplikacja działa dalej (bez importu)
    fetchAll<{ ref: string }>("cf_import_refs", [["ref", true]]).catch(() => [] as { ref: string }[]),
  ]);
  // pierwsze uruchomienie: domyślny zestaw kategorii
  if (categories.length === 0 && !settings.some((s) => s.key === "seeded")) {
    await seedCategories();
    categories = await fetchAll<Category>("cf_categories", [["position", true], ["id", true]]);
  }
  const txs = transactions.map((t) => ({ ...t, amount: Number(t.amount), category_id: num(t.category_id), receipt_id: num(t.receipt_id) }));
  return {
    categories: categories.map((c) => ({ ...c, monthly_limit: num(c.monthly_limit) })),
    transactions: txs.filter((t) => t.status !== "pending"),
    pending: txs.filter((t) => t.status === "pending").sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id),
    importRefs: new Set(refs.map((r) => r.ref)),
    receipts: receipts.map((r) => ({ ...r, total: Number(r.total), items: (r.items ?? []).map((i) => ({ ...i, amount: Number(i.amount) })) })),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""])),
  };
}

async function seedCategories() {
  check(await supabase.from("cf_categories").insert(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, position: i }))));
  await saveSetting("seeded", "1");
}

// --- transakcje -----------------------------------------------------------------
export async function insertTransactions(rows: NewTransaction[]): Promise<number[]> {
  if (!rows.length) return [];
  const res = check(await supabase.from("cf_transactions").insert(rows).select("id")) as { id: number }[];
  return res.map((r) => r.id);
}

export async function updateTransaction(id: number, row: Partial<NewTransaction>) {
  check(await supabase.from("cf_transactions").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id));
}

export async function deleteTransactions(ids: number[]) {
  if (ids.length) check(await supabase.from("cf_transactions").delete().in("id", ids));
}

// --- kategorie ------------------------------------------------------------------
export type CategoryInput = Omit<Category, "id">;

export async function insertCategory(c: CategoryInput) {
  check(await supabase.from("cf_categories").insert(c));
}

export async function updateCategory(id: number, c: Partial<CategoryInput>) {
  check(await supabase.from("cf_categories").update(c).eq("id", id));
}

export async function deleteCategory(id: number) {
  check(await supabase.from("cf_categories").delete().eq("id", id));
}

export async function reorderCategories(ids: number[]) {
  await Promise.all(ids.map((id, position) => supabase.from("cf_categories").update({ position }).eq("id", id)));
}

// --- paragony -------------------------------------------------------------------
export async function insertReceipt(r: Omit<Receipt, "id" | "created_at">): Promise<number> {
  const row = check(await supabase.from("cf_receipts").insert(r).select("id").single()) as { id: number };
  return row.id;
}

/** Usuwa paragon razem z jego transakcjami i zdjęciem. */
export async function deleteReceipt(r: Receipt) {
  check(await supabase.from("cf_transactions").delete().eq("receipt_id", r.id));
  check(await supabase.from("cf_receipts").delete().eq("id", r.id));
  if (r.image_path) await supabase.storage.from("cf-receipts").remove([r.image_path]);
}

// --- ustawienia -----------------------------------------------------------------
export async function saveSetting(key: string, value: string) {
  check(await supabase.from("cf_settings").upsert({ key, value }, { onConflict: "user_id,key" }));
}

// --- import z banku -----------------------------------------------------------------
export async function insertPending(rows: NewTransaction[]) {
  for (let i = 0; i < rows.length; i += 500) {
    check(await supabase.from("cf_transactions").insert(rows.slice(i, i + 500).map((r) => ({ ...r, status: "pending" }))));
  }
}

async function addRefs(refs: string[], action: "added" | "merged" | "skipped") {
  if (refs.length) check(await supabase.from("cf_import_refs").upsert(refs.map((ref) => ({ ref, action })), { onConflict: "user_id,ref", ignoreDuplicates: true }));
}

/** Zatwierdza pozycje z wyciągu (z poprawkami użytkownika). */
export async function confirmPending(items: { t: Transaction; patch?: Partial<NewTransaction> }[]) {
  for (const { t, patch } of items) {
    check(await supabase.from("cf_transactions").update({ ...patch, status: "confirmed", updated_at: new Date().toISOString() }).eq("id", t.id));
  }
  await addRefs(items.map((i) => i.t.bank_ref).filter((r): r is string => !!r), "added");
}

/** Pozycja z wyciągu to zakup już zapisany (paragon albo wpis ręczny) – zostaje tamten, bez dublowania. */
export async function mergePending(t: Transaction, target: { type: "receipt" | "transaction"; id: number }) {
  const table = target.type === "receipt" ? "cf_receipts" : "cf_transactions";
  check(await supabase.from(table).update({ bank_ref: t.bank_ref }).eq("id", target.id));
  check(await supabase.from("cf_transactions").delete().eq("id", t.id));
  if (t.bank_ref) await addRefs([t.bank_ref], "merged");
}

export async function skipPending(ts: Transaction[]) {
  check(await supabase.from("cf_transactions").delete().in("id", ts.map((t) => t.id)));
  await addRefs(ts.map((t) => t.bank_ref).filter((r): r is string => !!r), "skipped");
}

/** Przy zapisie paragonu: płatność z wyciągu zastępujemy rozbiciem z paragonu. */
export async function replaceBankTransaction(bankTx: Transaction, receiptId: number) {
  check(await supabase.from("cf_receipts").update({ bank_ref: bankTx.bank_ref }).eq("id", receiptId));
  check(await supabase.from("cf_transactions").delete().eq("id", bankTx.id));
}
