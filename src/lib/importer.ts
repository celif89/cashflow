// Import wyciągu: plik (PDF z Alior Banku albo CSV z dowolnego banku) → pozycje do sprawdzenia.
import {
  type BankLine, buildHistory, decodeBytes, detectDelimiter, detectLayout, type Layout, layoutOk, layoutSignature,
  maskForAi, ownTransferReason, parseCsv, suggestFromHistory, toLines,
} from "../engine/bank";
import { parsePdfStatement, type PdfItem } from "../engine/pdfStatement";
import type { Category, NewTransaction, Transaction } from "../engine/types";
import type { AppData } from "./data";
import { supabase } from "./supabase";

export interface StatementFile {
  name: string;
  format: "pdf" | "csv";
  lines: BankLine[];
  skipped: number;
  /** PDF: sumy z nagłówka wyciągu vs odczytane */
  check?: { declared: { credit: number; debit: number } | null; parsed: { credit: number; debit: number }; period: string | null };
  /** CSV: rozpoznany układ kolumn (do ręcznej poprawki) */
  csv?: { rows: string[][]; layout: Layout; signature: string };
}

async function pdfItems(bytes: Uint8Array): Promise<PdfItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); // wersja „legacy” działa też na starszych iPhone’ach
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) if ("str" in it) items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str });
  }
  return items;
}

export async function readStatement(file: File, savedLayouts: Record<string, string>): Promise<StatementFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (isPdf) {
    const s = parsePdfStatement(await pdfItems(bytes));
    if (!s.lines.length) throw new Error("Nie rozpoznano operacji w tym PDF. Obsługiwany jest wyciąg z Alior Banku – z innego banku pobierz historię jako CSV.");
    return { name: file.name, format: "pdf", lines: s.lines, skipped: 0, check: { declared: s.declared, parsed: s.parsed, period: s.period } };
  }
  const text = decodeBytes(bytes);
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) throw new Error("Plik jest pusty albo to nie jest CSV.");
  let layout = detectLayout(rows);
  const signature = layoutSignature(rows, layout);
  const saved = savedLayouts[`bank_layout:${signature}`];
  if (saved) try { layout = { ...layout, ...(JSON.parse(saved) as Layout) }; } catch { /* zignoruj uszkodzony wpis */ }
  return { name: file.name, format: "csv", ...csvLines(rows, layout), csv: { rows, layout, signature } };
}

export function csvLines(rows: string[][], layout: Layout): { lines: BankLine[]; skipped: number } {
  return layoutOk(layout) ? toLines(rows, layout) : { lines: [], skipped: rows.length };
}

/** Odciski linii, które już są w aplikacji (czekają, zatwierdzone, połączone albo pominięte). */
export function knownRefs(data: AppData): Set<string> {
  const s = new Set(data.importRefs);
  for (const t of [...data.transactions, ...data.pending]) if (t.bank_ref) s.add(t.bank_ref);
  for (const r of data.receipts) if (r.bank_ref) s.add(r.bank_ref);
  return s;
}

export interface Prepared { rows: NewTransaction[]; aiNeeded: number[] }

/** Nowe linie → transakcje oczekujące, z kategorią z historii tam, gdzie się da. */
export function prepare(lines: BankLine[], data: AppData): Prepared {
  const history = buildHistory(data.transactions);
  const rows: NewTransaction[] = [];
  const aiNeeded: number[] = [];
  for (const l of lines) {
    const own = ownTransferReason(l.text);
    const h = own ? null : suggestFromHistory(l, history);
    rows.push({
      day: l.day, amount: l.amount, kind: l.kind, category_id: h?.category_id ?? null, merchant: h?.merchant ?? null,
      note: null, receipt_id: null, bank_ref: l.ref, bank_text: l.text, category_source: h ? "history" : null,
    });
    if (!h && !own) aiNeeded.push(rows.length - 1);
  }
  return { rows, aiNeeded };
}

/**
 * Podpowiedzi Claude dla pozycji nieznanych z historii – paczkami po 40, najwyżej 3 naraz.
 * Błąd (np. brak klucza) nie przerywa importu: pozycje zostają bez kategorii.
 */
export async function suggestWithAi(rows: NewTransaction[], idx: number[], categories: Category[], onProgress?: (done: number) => void): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !idx.length) return null;
  const valid = new Map(categories.filter((c) => !c.archived).map((c) => [c.id, c.kind]));
  const cats = categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const chunks: number[][] = [];
  for (let i = 0; i < idx.length; i += 40) chunks.push(idx.slice(i, i + 40));
  let error: string | null = null, done = 0;
  const runChunk = async (chunk: number[]) => {
    try {
      const res = await fetch("/.netlify/functions/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categories: cats, lines: chunk.map((i) => ({ i, kind: rows[i].kind, amount: rows[i].amount, text: maskForAi(rows[i].bank_text ?? "") })) }),
      });
      const body = await res.json().catch(() => null) as { items?: { i: number; merchant: string | null; category_id: number | null }[]; error?: string } | null;
      if (!res.ok || !body?.items) { error = body?.error ?? `błąd ${res.status}`; return; }
      for (const it of body.items) {
        const row = rows[it.i];
        if (!row || !chunk.includes(it.i)) continue;
        if (it.merchant?.trim()) row.merchant = it.merchant.trim().slice(0, 80);
        if (it.category_id !== null && valid.get(it.category_id) === row.kind) {
          row.category_id = it.category_id;
          row.category_source = "ai";
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      done += chunk.length;
      onProgress?.(done);
    }
  };
  for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map(runChunk));
  return error;
}

/** Pozycja „pewna”: kategoria z historii, nie przelew własny, nie pasuje do paragonu/wpisu. */
export const isConfident = (t: Transaction, matched: boolean) =>
  t.category_source === "history" && t.category_id !== null && !matched && !ownTransferReason(t.bank_text ?? "");
