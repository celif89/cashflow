// Odczyt i zapis danych w Supabase (tabele cf_*).
import { DEFAULT_CATEGORIES } from "../engine/defaults";
import type { Category, NewTransaction, Receipt, Transaction } from "../engine/types";
import { supabase } from "./supabase";

export interface AppData {
  categories: Category[];
  transactions: Transaction[];
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
  let [categories, transactions, receipts, settings] = await Promise.all([
    fetchAll<Category>("cf_categories", [["position", true], ["id", true]]),
    fetchAll<Transaction>("cf_transactions", [["day", false], ["id", false]]),
    fetchAll<Receipt>("cf_receipts", [["day", false], ["id", false]]),
    fetchAll<{ key: string; value: string }>("cf_settings", [["key", true]]),
  ]);
  // pierwsze uruchomienie: domyślny zestaw kategorii
  if (categories.length === 0 && !settings.some((s) => s.key === "seeded")) {
    await seedCategories();
    categories = await fetchAll<Category>("cf_categories", [["position", true], ["id", true]]);
  }
  return {
    categories: categories.map((c) => ({ ...c, monthly_limit: num(c.monthly_limit) })),
    transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount), category_id: num(t.category_id), receipt_id: num(t.receipt_id) })),
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
