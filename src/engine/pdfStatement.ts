// Wyciąg w PDF (układ Alior Banku: DATA KSIĘGOWANIA / DATA OPERACJI · OPIS · KWOTA · SALDO).
// Tekst wyciągamy z PDF w przeglądarce (pdf.js) razem z położeniem na stronie, a tutaj
// składamy go w operacje. Plik nie wychodzi z urządzenia.
import { assignRefs, type BankLine, parseBankDate, parseSignedAmount } from "./bank";
import { round2, toGr } from "./money";

export interface PdfItem { page: number; x: number; y: number; w: number; str: string }

interface Row { page: number; y: number; items: PdfItem[] }

export interface PdfStatement {
  lines: BankLine[];
  period: string | null;
  /** sumy z nagłówka wyciągu – do sprawdzenia, czy odczytaliśmy wszystko */
  declared: { credit: number; debit: number } | null;
  parsed: { credit: number; debit: number };
}

const AMOUNT = /^-?\d{1,3}(?:[  ]\d{3})*,\d{2}$/;
const DATE = /^\d{4}\.\d{2}\.\d{2}$/;

/** Elementy tekstu → wiersze (ten sam y na stronie), od góry do dołu, od lewej do prawej. */
export function toRows(items: PdfItem[]): Row[] {
  const rows: Row[] = [];
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2) last.items.push(it);
    else rows.push({ page: it.page, y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

const rowText = (r: Row) => r.items.map((i) => i.str.trim()).join(" ");
const right = (i: PdfItem) => i.x + i.w;

function declaredTotal(rows: Row[], label: RegExp): number | null {
  for (const r of rows) {
    if (!label.test(rowText(r))) continue;
    const amounts = r.items.filter((i) => AMOUNT.test(i.str.trim()));
    if (amounts.length) return parseSignedAmount(amounts[amounts.length - 1].str);
  }
  return null;
}

/** Opis z banku → krótszy, czytelny tekst (bez numeru konta, numeru karty, powtórzonej daty). */
export function tidyDescription(kind: string, desc: string): string {
  let d = desc.replace(/\s+/g, " ").trim();
  const mcc = /Kod MCC:\s*(\d{4})/.exec(d)?.[1];
  d = d
    .replace(/^\d{2}(?: ?\d{4}){6}\s*/, "") // numer rachunku kontrahenta
    .replace(/\s*\d{4} X{4} X{4} \d{4}.*$/, "") // numer karty i wszystko po nim (data, kwoty, MCC)
    .replace(/Data transakcji:\s*\d{4}-\d{2}-\s*\d{2}/g, "")
    .replace(/\s*BLIK \/OPT\/.*$/, "") // techniczny dopisek płatności BLIK w internecie
    .replace(/\b(WEB_PURCHASE|POS_PURCHASE)\b/g, "")
    .replace(/Nowa Bankowość (Mobilna|Internetowa)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [kind.trim(), d, mcc ? `MCC ${mcc}` : ""].filter(Boolean).join(" · ");
}

export function parsePdfStatement(items: PdfItem[]): PdfStatement {
  const rows = toRows(items);
  const head = rows.find((r) => r.items.some((i) => /^KWOTA$/i.test(i.str.trim())) && r.items.some((i) => /^SALDO$/i.test(i.str.trim())));
  if (!head) return { lines: [], period: null, declared: null, parsed: { credit: 0, debit: 0 } };
  const kwota = head.items.find((i) => /^KWOTA$/i.test(i.str.trim()))!;
  const opis = head.items.find((i) => /^OPIS$/i.test(i.str.trim()));
  const descX = (opis?.x ?? 160) - 6;
  const amountRight = right(kwota);
  const isAmountCol = (i: PdfItem) => AMOUNT.test(i.str.trim()) && Math.abs(right(i) - amountRight) <= 18;

  type Draft = { booked: string; operated: string | null; kind: string; amount: number; desc: string[] };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  const startIdx = rows.indexOf(head);
  for (const r of rows.slice(startIdx + 1)) {
    const text = rowText(r);
    if (/Zestawienie opłat|Ten dokument jest wydrukiem/i.test(text)) break;
    const first = r.items[0];
    const firstIsDate = first.x < descX && DATE.test(first.str.trim());
    const amount = r.items.find(isAmountCol);
    if (firstIsDate && amount) {
      cur = {
        booked: first.str.trim(), operated: null, amount: parseSignedAmount(amount.str) ?? 0, desc: [],
        kind: r.items.filter((i) => i.x >= descX && i !== amount && right(i) < amountRight - 40).map((i) => i.str.trim()).join(" "),
      };
      drafts.push(cur);
      continue;
    }
    if (!cur) continue;
    // nagłówek/stopka strony („Nr wyciągu”, „Infolinia…”) zaczyna się przy lewym marginesie
    if (first.x < descX && !firstIsDate) continue;
    if (firstIsDate && !cur.operated) cur.operated = first.str.trim();
    const desc = r.items.filter((i) => i.x >= descX && right(i) < amountRight - 30).map((i) => i.str.trim()).join(" ");
    if (desc && cur.desc.length < 10) cur.desc.push(desc);
  }

  const out = drafts
    .map((d) => {
      const day = parseBankDate((d.operated ?? d.booked).replace(/\./g, "-")) ?? parseBankDate(d.booked.replace(/\./g, "-"));
      return day && d.amount !== 0
        ? { day, amount: Math.abs(d.amount), kind: d.amount < 0 ? ("expense" as const) : ("income" as const), text: tidyDescription(d.kind, d.desc.join(" ")) }
        : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const sumGr = (k: "expense" | "income") => out.filter((l) => l.kind === k).reduce((a, l) => a + toGr(l.amount), 0) / 100;
  const credit = declaredTotal(rows, /Uznania ogółem/i), debit = declaredTotal(rows, /Obciążenia ogółem/i);
  const periodRow = rows.find((r) => /Wyciąg za okres/i.test(rowText(r)));
  const period = periodRow ? /(\d{4}\.\d{2}\.\d{2}\s*-\s*\d{4}\.\d{2}\.\d{2})/.exec(rowText(periodRow))?.[1] ?? null : null;
  return {
    lines: assignRefs(out),
    period,
    declared: credit !== null && debit !== null ? { credit: Math.abs(credit), debit: Math.abs(debit) } : null,
    parsed: { credit: round2(sumGr("income")), debit: round2(sumGr("expense")) },
  };
}
