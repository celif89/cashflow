// Import wyciągu z banku (CSV). Każdy bank ma inny układ pliku, więc kolumny rozpoznajemy
// po nagłówkach („Data operacji”, „Kwota”, „Opis”…), a gdy ich nie ma – po zawartości.
import { parseDay } from "./dates";
import { round2, toGr } from "./money";
import { fold } from "./stats";
import type { Kind, Receipt, Transaction } from "./types";

// --- odczyt pliku -------------------------------------------------------------------

/** UTF-8, a gdy plik nim nie jest – Windows-1250 (polskie banki często tak eksportują). */
export function decodeBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1250").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** Separator, przy którym najwięcej wierszy ma tę samą (większą niż 2) liczbę kolumn. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 60).join("\n");
  let best = ";", bestScore = -1;
  for (const d of [";", ",", "\t", "|"]) {
    const counts = parseCsv(sample, d).map((r) => r.length).filter((n) => n > 2);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = times * Math.log2(mode + 1);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

// --- wartości ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-11-18, 18.11.2026, 18-11-2026, 18/11/2026, 2026.11.18 (także z godziną) → RRRR-MM-DD */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\D|$)/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:\D|$)/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const day = `${y}-${pad(m)}-${pad(d)}`;
  return parseDay(day).getDate() === d ? day : null;
}

/** „-1 234,56 PLN”, „−12,00”, „+5000.00”, „1.234,56” → liczba ze znakiem; inaczej null. */
export function parseSignedAmount(raw: string): number | null {
  // dopuszczamy tylko kod waluty przed lub za liczbą – „BIEDRONKA 3021” to nie kwota
  let s = raw.replace(/[\s\u00a0'"]/g, "").replace(/[−–]/g, "-").replace(/(PLN|zł|zl|EUR|USD|GBP|CHF)$/i, "").replace(/^(PLN|EUR|USD|GBP|CHF)/i, "");
  if (!s) return null;
  const neg = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[-+(]|\)$/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    s = s.split(dec === "," ? "." : ",").join("").replace(",", ".");
  } else if (lastComma >= 0) {
    s = s.split(".").join("").replace(/,(?=.*,)/g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split(".").join(""); // 1.234 = tysiąc dwieście…
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return round2(neg ? -n : n);
}

// --- układ kolumn ------------------------------------------------------------------------

export interface Layout {
  /** wiersz nagłówka (-1 = plik bez nagłówka) */
  headerRow: number;
  date: number;
  /** jedna kolumna kwoty ze znakiem… */
  amount: number | null;
  /** …albo dwie: obciążenia (wydatki) i uznania (wpływy) */
  debit: number | null;
  credit: number | null;
  /** kolumny składające się na opis */
  text: number[];
}

const norm = (s: string) => fold(s.replace(/^#/, ""));
const has = (h: string, words: string[]) => words.some((w) => h.includes(w));

const DATE_WORDS = ["data transakcji", "data operacji", "data wykonania", "data zlecenia", "data ksiegowania", "data"];
const TEXT_WORDS = ["opis", "tytul", "kontrahent", "odbiorca", "nadawca", "zleceniodawca", "nazwa", "szczegol", "lokalizacja", "typ transakcji", "rodzaj", "dane"];
const NOT_TEXT = ["rachun", "konto", "konta", "saldo", "walut", "nr transakcji", "numer", "kategoria", "bank", "data", "kwota"];

function headerScore(row: string[]): number {
  const h = row.map(norm);
  const date = h.some((c) => c.startsWith("data"));
  const amount = h.some((c) => has(c, ["kwota", "obciazen", "uznani", "wplyw", "wydatk", "amount"]));
  return date && amount ? h.filter(Boolean).length : 0;
}

function columnStats(rows: string[][], col: number) {
  const vals = rows.map((r) => r[col] ?? "").filter((v) => v !== "");
  const dates = vals.filter((v) => parseBankDate(v)).length;
  const nums = vals.map(parseSignedAmount);
  const numeric = nums.filter((n) => n !== null).length;
  return {
    filled: vals.length,
    dateShare: vals.length ? dates / vals.length : 0,
    numShare: vals.length ? numeric / vals.length : 0,
    hasNegative: nums.some((n) => n !== null && n < 0),
    meanAbs: numeric ? nums.reduce<number>((a, n) => a + Math.abs(n ?? 0), 0) / numeric : 0,
    avgLen: vals.length ? vals.reduce((a, v) => a + v.length, 0) / vals.length : 0,
  };
}

export function detectLayout(rows: string[][]): Layout {
  // nagłówek: wiersz z „Data…” i „Kwota…” w pierwszych 40 wierszach (mBank i ING mają wcześniej podsumowanie)
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) if (headerScore(rows[i]) > 0) { headerRow = i; break; }
  const body = rows.slice(headerRow + 1, headerRow + 201);
  const width = Math.max(0, ...body.map((r) => r.length));
  const stats = Array.from({ length: width }, (_, c) => columnStats(body, c));
  const layout: Layout = { headerRow, date: -1, amount: null, debit: null, credit: null, text: [] };

  if (headerRow >= 0) {
    const h = rows[headerRow].map(norm);
    for (const w of DATE_WORDS) {
      const i = h.findIndex((c) => c.includes(w) && !c.includes("walut") && stats[h.indexOf(c)]?.dateShare > 0.5);
      if (i >= 0) { layout.date = i; break; }
    }
    const amountCols = h.map((c, i) => ({ c, i }))
      .filter(({ c }) => c.includes("kwota") && !has(c, ["blokad", "w walucie", "oryginal", "saldo", "prowizj"]));
    const exact = amountCols.find(({ c }) => c === "kwota" || c.startsWith("kwota transakcji") || c.startsWith("kwota operacji"));
    const pick = exact ?? amountCols[0];
    if (pick) layout.amount = pick.i;
    else {
      const debit = h.findIndex((c) => has(c, ["obciazen", "wydatk", "winien"]));
      const credit = h.findIndex((c) => has(c, ["uznani", "wplyw"]));
      if (debit >= 0 && credit >= 0) { layout.debit = debit; layout.credit = credit; }
    }
    layout.text = h.map((c, i) => ({ c, i }))
      .filter(({ c, i }) => i !== layout.date && i !== layout.amount
        && ((has(c, TEXT_WORDS) && !has(c, NOT_TEXT.filter((w) => !c.startsWith("dane") || w !== "dane")))
          // kolumny bez nagłówka z tekstem (PKO dopisuje szczegóły w kolejnych kolumnach)
          || (c === "" && stats[i]?.filled > 0 && stats[i].numShare < 0.5 && stats[i].dateShare < 0.5)))
      .map(({ i }) => i);
  }

  // brak nagłówka albo czegoś nie znaleziono – po zawartości
  if (layout.date < 0) layout.date = stats.findIndex((s) => s.dateShare >= 0.7);
  if (layout.amount === null && layout.debit === null) {
    const cands = stats.map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i !== layout.date && s.dateShare < 0.3 && s.numShare >= 0.7 && s.hasNegative);
    // saldo też bywa ujemne, ale zwykle jest dużo większe od pojedynczych kwot
    cands.sort((a, b) => a.s.meanAbs - b.s.meanAbs);
    if (cands[0]) layout.amount = cands[0].i;
  }
  if (!layout.text.length) {
    layout.text = stats.map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i !== layout.date && i !== layout.amount && s.filled > 0 && s.numShare < 0.3 && s.dateShare < 0.3 && s.avgLen > 3)
      .sort((a, b) => b.s.avgLen - a.s.avgLen)
      .slice(0, 3)
      .map(({ i }) => i)
      .sort((a, b) => a - b);
  }
  return layout;
}

export const layoutOk = (l: Layout) => l.date >= 0 && (l.amount !== null || (l.debit !== null && l.credit !== null));

/** Podpis układu (nagłówek albo liczba kolumn) – pod nim zapamiętujemy ręczne poprawki. */
export function layoutSignature(rows: string[][], l: Layout): string {
  const base = l.headerRow >= 0 ? rows[l.headerRow].map(norm).join("|") : `cols:${Math.max(...rows.slice(0, 20).map((r) => r.length))}`;
  return hash(base);
}

// --- linie wyciągu -----------------------------------------------------------------------

export interface BankLine {
  day: string;
  amount: number; // zawsze dodatnia
  kind: Kind;
  text: string;
  ref: string;
}

export interface ParsedStatement { lines: BankLine[]; skipped: number }

export function toLines(rows: string[][], l: Layout): ParsedStatement {
  const out: Omit<BankLine, "ref">[] = [];
  let skipped = 0;
  for (const r of rows.slice(l.headerRow + 1)) {
    const day = parseBankDate(r[l.date] ?? "");
    let signed: number | null = null;
    if (l.amount !== null) signed = parseSignedAmount(r[l.amount] ?? "");
    else if (l.debit !== null && l.credit !== null) {
      const d = parseSignedAmount(r[l.debit] ?? ""), c = parseSignedAmount(r[l.credit] ?? "");
      if (d) signed = -Math.abs(d);
      else if (c) signed = Math.abs(c);
    }
    if (!day || signed === null || signed === 0) { skipped++; continue; }
    const text = l.text.map((i) => (r[i] ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");
    out.push({ day, amount: Math.abs(signed), kind: signed < 0 ? "expense" : "income", text });
  }
  return { lines: assignRefs(out), skipped };
}

/** Odcisk linii: data + kwota + opis + numer kolejny (dwie identyczne kawy tego samego dnia to dwie linie). */
export function assignRefs(lines: Omit<BankLine, "ref">[]): BankLine[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const key = `${l.day}|${toGr(l.amount)}|${l.kind}|${fold(l.text)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...l, ref: hash(`${key}|${n}`) };
  });
}

/** cyrb53 – krótki, stabilny skrót tekstu. */
export function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// --- podpowiedzi -------------------------------------------------------------------------

const OWN_TRANSFER = [
  "przelew wlasny", "przelew wewnetrzny", "na rachunek wlasny", "na wlasny rachunek", "miedzy rachunkami", "srodkow wlasnych",
  "splata karty", "splata zadluzenia", "lokata", "lokaty", "konto oszczednosciowe", "rachunek oszczednosciowy",
  "cel oszczednosciowy", "moje cele", "skarbonka", "wplata na cel",
];

/** Przelew między własnymi kontami, spłata karty, lokata – to nie wydatek ani przychód. */
export function ownTransferReason(text: string): string | null {
  const f = ` ${fold(text)} `;
  if (OWN_TRANSFER.some((w) => f.includes(` ${w}`))) return "Wygląda na przelew między własnymi kontami lub na oszczędności – to nie wydatek ani przychód.";
  // MCC 4829 = przekaz pieniężny: doładowanie Revoluta, PayPala, Zen… (własny portfel)
  if (/\b(revolut|paypal|skrill|zen com|wise)\b/.test(f) && f.includes(" mcc 4829 ")) {
    return "Wygląda na doładowanie Twojego portfela (Revolut, PayPal…). Jeśli wydatki z niego wpisujesz osobno, pomiń – inaczej policzysz je dwa razy.";
  }
  return null;
}

/** Opis bez liczb (daty, numery kart, kwoty) – stały dla powtarzających się przelewów. */
export const textKey = (text: string) => fold(text.replace(/\d+/g, " "));

export interface HistoryIndex {
  byText: Map<string, { category_id: number; merchant: string | null }>;
  merchants: { key: string; name: string; category_id: number; kind: Kind }[];
}

/** Uczy się z zatwierdzonych transakcji: sklep → najczęstsza kategoria, opis z banku → kategoria. */
export function buildHistory(txs: Transaction[]): HistoryIndex {
  const merchantCats = new Map<string, { name: string; kind: Kind; counts: Map<number, number> }>();
  const textCats = new Map<string, { merchant: string | null; counts: Map<number, number> }>();
  const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1);
  const top = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const t of txs) {
    if (t.status === "pending" || t.category_id === null) continue;
    const mk = t.merchant ? fold(t.merchant) : "";
    if (mk.length >= 4) {
      const e = merchantCats.get(mk) ?? { name: t.merchant!.trim(), kind: t.kind, counts: new Map() };
      bump(e.counts, t.category_id);
      merchantCats.set(mk, e);
    }
    if (t.bank_text) {
      const k = textKey(t.bank_text);
      const e = textCats.get(k) ?? { merchant: t.merchant, counts: new Map() };
      bump(e.counts, t.category_id);
      textCats.set(k, e);
    }
  }
  return {
    byText: new Map([...textCats.entries()].map(([k, e]) => [k, { category_id: top(e.counts), merchant: e.merchant }])),
    merchants: [...merchantCats.entries()]
      .map(([key, e]) => ({ key, name: e.name, kind: e.kind, category_id: top(e.counts) }))
      .sort((a, b) => b.key.length - a.key.length),
  };
}

export function suggestFromHistory(line: Pick<BankLine, "text" | "kind">, h: HistoryIndex): { category_id: number; merchant: string | null } | null {
  const exact = h.byText.get(textKey(line.text));
  if (exact) return exact;
  const f = ` ${fold(line.text)} `;
  const m = h.merchants.find((x) => x.kind === line.kind && f.includes(` ${x.key} `));
  return m ? { category_id: m.category_id, merchant: m.name } : null;
}

/** Do wysłania do Claude: bez numerów kont i kart. */
export const maskForAi = (text: string) =>
  text
    .replace(/\d{4}(?:[ -]?[X*x]{4}){2}[ -]?\d{4}/g, "#") // numer karty „5102 XXXX XXXX 8400”
    .replace(/(?:\d[\s-]?){8,}\d?/g, "#") // numer rachunku
    .slice(0, 300);

// --- dopasowanie do paragonów i ręcznych wpisów ---------------------------------------------

export type Match =
  | { type: "receipt"; id: number; day: string; label: string }
  | { type: "transaction"; id: number; day: string; label: string };

const dayDiff = (a: string, b: string) => Math.abs(Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000));

/**
 * Szuka dla każdej linii z banku zakupu już zapisanego w aplikacji (zeskanowany paragon albo
 * ręcznie wpisany wydatek) o tej samej kwocie, najwyżej 3 dni wcześniej lub później
 * (płatność kartą księguje się z opóźnieniem). Każdy zakup pasuje najwyżej do jednej linii.
 */
export function matchExisting(pending: Transaction[], receipts: Receipt[], txs: Transaction[]): Map<number, Match> {
  const out = new Map<number, Match>();
  const usedR = new Set<number>(), usedT = new Set<number>();
  for (const p of pending) {
    const gr = toGr(p.amount);
    let best: { m: Match; diff: number } | null = null;
    if (p.kind === "expense") {
      for (const r of receipts) {
        if (r.bank_ref || usedR.has(r.id) || toGr(r.total) !== gr) continue;
        const diff = dayDiff(r.day, p.day);
        if (diff <= 3 && (!best || diff < best.diff)) best = { m: { type: "receipt", id: r.id, day: r.day, label: r.merchant || "paragon" }, diff };
      }
    }
    if (!best) {
      for (const t of txs) {
        if (t.status === "pending" || t.bank_ref || t.receipt_id || usedT.has(t.id) || t.kind !== p.kind || toGr(t.amount) !== gr) continue;
        const diff = dayDiff(t.day, p.day);
        if (diff <= 3 && (!best || diff < best.diff)) best = { m: { type: "transaction", id: t.id, day: t.day, label: t.merchant || t.note || "wpis ręczny" }, diff };
      }
    }
    if (best) {
      out.set(p.id, best.m);
      (best.m.type === "receipt" ? usedR : usedT).add(best.m.id);
    }
  }
  return out;
}

/** Odwrotnie: przy zapisie paragonu – czy ten zakup jest już w budżecie z wyciągu. */
export function bankTransactionForReceipt(total: number, day: string, txs: Transaction[]): Transaction | null {
  const gr = toGr(total);
  let best: { t: Transaction; diff: number } | null = null;
  for (const t of txs) {
    if (t.status === "pending" || !t.bank_ref || t.receipt_id || t.kind !== "expense" || toGr(t.amount) !== gr) continue;
    const diff = dayDiff(t.day, day);
    if (diff <= 3 && (!best || diff < best.diff)) best = { t, diff };
  }
  return best?.t ?? null;
}
