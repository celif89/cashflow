import { describe, expect, it } from "vitest";
import {
  assignRefs, bankTransactionForReceipt, buildHistory, decodeBytes, detectDelimiter, detectLayout, layoutOk, maskForAi,
  matchExisting, ownTransferReason, parseBankDate, parseCsv, parseSignedAmount, suggestFromHistory, toLines,
} from "../src/engine/bank";
import { parsePdfStatement, type PdfItem, tidyDescription } from "../src/engine/pdfStatement";
import type { Receipt, Transaction } from "../src/engine/types";

const read = (csv: string) => {
  const rows = parseCsv(csv, detectDelimiter(csv));
  const layout = detectLayout(rows);
  return { layout, ...toLines(rows, layout) };
};

describe("wartości z wyciągu", () => {
  it("daty w różnych zapisach", () => {
    expect(parseBankDate("2026-11-18")).toBe("2026-11-18");
    expect(parseBankDate("18.11.2026")).toBe("2026-11-18");
    expect(parseBankDate("2026.11.18 12:30")).toBe("2026-11-18");
    expect(parseBankDate("31.02.2026")).toBeNull();
    expect(parseBankDate("Kwota")).toBeNull();
  });
  it("kwoty ze znakiem", () => {
    expect(parseSignedAmount("-1 234,56 PLN")).toBe(-1234.56);
    expect(parseSignedAmount("−12,00")).toBe(-12);
    expect(parseSignedAmount("+5000.00")).toBe(5000);
    expect(parseSignedAmount("1.234,56")).toBe(1234.56);
    expect(parseSignedAmount("1,234.56")).toBe(1234.56);
    expect(parseSignedAmount("abc")).toBeNull();
    expect(parseSignedAmount("")).toBeNull();
  });
  it("Windows-1250 zamiast UTF-8", () => {
    const bytes = new Uint8Array([0x50, 0xb3, 0x61, 0x74, 0x6e, 0x6f, 0x9c, 0xe6]); // „Płatność” w cp1250
    expect(decodeBytes(bytes)).toBe("Płatność");
  });
});

describe("rozpoznawanie układu CSV (zmyślone dane w układach różnych banków)", () => {
  it("nagłówek w pierwszym wierszu, opis w kilku kolumnach, także bez nazwy", () => {
    const r = read([
      '"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","",""',
      '"2026-11-18","2026-11-18","Płatność kartą","-106.35","PLN","+4521.12","Tytuł: 0001","Lokalizacja: BIEDRONKA 3021",""',
      '"2026-11-10","2026-11-10","Przelew na konto","+8400.00","PLN","+4627.47","Wynagrodzenie 11/2026","Nadawca: FIRMA SP Z O O",""',
    ].join("\n"));
    expect(r.layout).toMatchObject({ headerRow: 0, date: 0, amount: 3 });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ day: "2026-11-18", amount: 106.35, kind: "expense" });
    expect(r.lines[0].text).toContain("BIEDRONKA 3021");
    expect(r.lines[0].text).toContain("Płatność kartą");
    expect(r.lines[1]).toMatchObject({ amount: 8400, kind: "income" });
  });

  it("podsumowanie przed nagłówkiem, # w nazwach kolumn, kwota z walutą", () => {
    const r = read([
      "#Klient;", "JAN TESTOWY;", ";", "#Za okres:;", "01.11.2026;18.11.2026;", ";",
      "#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;",
      '2026-11-17;"ORLEN STACJA NR 123  KRAKOW";"eKonto 1111";"Paliwo";-250,00 PLN;',
      '2026-11-16;"PRZELEW WŁASNY NA RACHUNEK OSZCZĘDNOŚCIOWY";"eKonto 1111";"Oszczędności";-500,00 PLN;',
    ].join("\n"));
    expect(r.layout.headerRow).toBe(4); // puste wiersze („;”) są pomijane
    expect(r.lines.map((l) => [l.day, l.amount, l.kind])).toEqual([["2026-11-17", 250, "expense"], ["2026-11-16", 500, "expense"]]);
    expect(r.lines[0].text).toContain("ORLEN");
    expect(r.lines[0].text).not.toContain("eKonto"); // kolumna rachunku to nie opis
  });

  it("kwota transakcji obok kwoty blokady – liczy się tylko zaksięgowana", () => {
    const r = read([
      '"Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Kwota transakcji (waluta rachunku)";"Waluta";"Kwota blokady/zwolnienie blokady";"Waluta"',
      '2026-11-18;2026-11-19;"LIDL KATOWICE";"Płatność kartą";"";-67,43;PLN;;',
      '2026-11-19;;"ZABKA Z1234";"Płatność kartą";"";;;-12,99;PLN',
    ].join("\n"));
    expect(r.layout.amount).toBe(5);
    expect(r.lines).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.lines[0]).toMatchObject({ amount: 67.43, text: "LIDL KATOWICE · Płatność kartą" });
  });

  it("osobne kolumny obciążeń i uznań", () => {
    const r = read([
      "Numer rachunku/karty,Data transakcji,Data rozliczenia,Rodzaj transakcji,Odbiorca/Zleceniodawca,Opis,Obciążenia,Uznania,Saldo,Waluta",
      'PL11,2026-11-18,2026-11-18,TRANSAKCJA KARTĄ,ROSSMANN 123,,-45.98,,1200.00,PLN',
      'PL11,2026-11-10,2026-11-10,PRZELEW PRZYCHODZĄCY,FIRMA,Wypłata,,8400.00,1245.98,PLN',
    ].join("\n"));
    expect(r.layout).toMatchObject({ amount: null, debit: 6, credit: 7 });
    expect(r.lines.map((l) => [l.amount, l.kind])).toEqual([[45.98, "expense"], [8400, "income"]]);
  });

  it("plik bez nagłówka – kolumny po zawartości (saldo większe od kwot)", () => {
    const r = read([
      "18-11-2026,18-11-2026,BIEDRONKA 3021 WROCLAW,PL11,\"-106,35\",\"4521,12\",1",
      "17-11-2026,17-11-2026,APTEKA GEMINI,PL11,\"-23,10\",\"4627,47\",2",
      "10-11-2026,10-11-2026,WYNAGRODZENIE,PL11,\"8400,00\",\"4650,57\",3",
    ].join("\n"));
    expect(layoutOk(r.layout)).toBe(true);
    expect(r.layout.headerRow).toBe(-1);
    expect(r.lines.map((l) => l.amount)).toEqual([106.35, 23.1, 8400]);
    expect(r.lines[0].text).toContain("BIEDRONKA");
  });
});

describe("odciski linii", () => {
  it("są stałe przy ponownym imporcie, a dwie identyczne kawy tego samego dnia to dwie linie", () => {
    const base = { day: "2026-11-18", amount: 12, kind: "expense" as const, text: "STARBUCKS" };
    const a = assignRefs([base, base, { ...base, day: "2026-11-19" }]);
    const b = assignRefs([base, base, { ...base, day: "2026-11-19" }]);
    expect(new Set(a.map((l) => l.ref)).size).toBe(3);
    expect(a.map((l) => l.ref)).toEqual(b.map((l) => l.ref));
  });
});

let id = 1;
const tx = (p: Partial<Transaction>): Transaction => ({ id: id++, day: "2026-11-01", amount: 10, kind: "expense", category_id: 1, merchant: null, note: null, receipt_id: null, ...p });

describe("podpowiedzi", () => {
  it("przelewy własne i oszczędności", () => {
    expect(ownTransferReason("PRZELEW WŁASNY · JAN Przelew własny")).not.toBeNull();
    expect(ownTransferReason("Spłata karty kredytowej")).not.toBeNull();
    expect(ownTransferReason("TRANSAKCJA KARTĄ · LIDL")).toBeNull();
    expect(ownTransferReason("TRANSAKCJA KARTĄ DEBETOWĄ · Revolut**1234* Dublin IRL · MCC 4829")).toMatch(/portfel/);
    expect(ownTransferReason("TRANSAKCJA KARTĄ DEBETOWĄ · Revolut Bistro · MCC 5812")).toBeNull();
  });

  it("kategoria z historii: po sklepie zawartym w opisie i po powtarzającym się opisie przelewu", () => {
    const h = buildHistory([
      tx({ merchant: "Biedronka", category_id: 1 }),
      tx({ merchant: "Biedronka", category_id: 1 }),
      tx({ merchant: "Biedronka", category_id: 4 }),
      tx({ merchant: "Spółdzielnia", category_id: 2, bank_text: "PRZELEW KRAJOWY · SM ZACISZE czynsz 10/2026" }),
      tx({ merchant: "Kasia", category_id: 9, status: "pending" }),
    ]);
    expect(suggestFromHistory({ text: "TRANSAKCJA KARTĄ · BIEDRONKA 3021 Wroclaw POL · MCC 5411", kind: "expense" }, h)).toEqual({ category_id: 1, merchant: "Biedronka" });
    expect(suggestFromHistory({ text: "PRZELEW KRAJOWY · SM ZACISZE czynsz 11/2026", kind: "expense" }, h)?.category_id).toBe(2);
    expect(suggestFromHistory({ text: "BIEDRONKA zwrot", kind: "income" }, h)).toBeNull(); // inny rodzaj
    expect(suggestFromHistory({ text: "KASIA", kind: "expense" }, h)).toBeNull(); // niezatwierdzone się nie liczą
  });

  it("do Claude bez numerów kont i kart", () => {
    expect(maskForAi("PRZELEW · 40 1600 1462 1845 2791 9000 0001 KLUB · karta 5102 XXXX XXXX 8400")).not.toMatch(/1600|8400/);
  });
});

describe("dopasowanie do paragonów i wpisów", () => {
  const receipt = (p: Partial<Receipt>): Receipt => ({ id: id++, day: "2026-11-18", merchant: "Biedronka", total: 106.35, image_path: null, items: [], ...p });

  it("płatność kartą ↔ paragon (ta sama kwota, do 3 dni), każdy paragon raz", () => {
    const r1 = receipt({});
    const p1 = tx({ day: "2026-11-19", amount: 106.35, status: "pending" });
    const p2 = tx({ day: "2026-11-20", amount: 106.35, status: "pending" });
    const p3 = tx({ day: "2026-11-25", amount: 106.35, status: "pending" });
    const m = matchExisting([p1, p2, p3], [r1, receipt({ bank_ref: "x" })], []);
    expect(m.get(p1.id)).toMatchObject({ type: "receipt", id: r1.id });
    expect(m.has(p2.id)).toBe(false);
    expect(m.has(p3.id)).toBe(false);
  });

  it("wpis ręczny bez paragonu też się dopasuje", () => {
    const manual = tx({ day: "2026-11-05", amount: 1850, merchant: "Wspólnota" });
    const fromBank = tx({ day: "2026-11-06", amount: 1850, status: "pending" });
    expect(matchExisting([fromBank], [], [manual]).get(fromBank.id)).toMatchObject({ type: "transaction", id: manual.id });
  });

  it("przy zapisie paragonu znajduje płatność z wyciągu", () => {
    const bank = tx({ day: "2026-11-19", amount: 106.35, bank_ref: "r1", status: "confirmed" });
    expect(bankTransactionForReceipt(106.35, "2026-11-18", [bank, tx({ amount: 106.35 })])?.id).toBe(bank.id);
    expect(bankTransactionForReceipt(106.36, "2026-11-18", [bank])).toBeNull();
  });
});

// --- PDF w układzie Alior Banku: elementy tekstu z położeniem (jak z pdf.js), dane zmyślone ---
function aliorPdf(): PdfItem[] {
  const items: PdfItem[] = [];
  const t = (page: number, x: number, y: number, str: string, w = str.length * 5) => items.push({ page, x, y, w, str });
  const amount = (page: number, y: number, kw: string, saldo: string) => {
    const kwW = kw.length * 4.4, sW = saldo.length * 4.4;
    t(page, 493 - kwW, y, kw, kwW);
    t(page, 563 - sW, y, saldo, sW);
  };
  const pageHeader = (page: number) => {
    t(page, 70, 804, "Nr wyciągu:"); t(page, 170, 804, "10");
    t(page, 70, 794, "Wyciąg za okres:"); t(page, 170, 794, "2026.10.01 - 2026.10.31");
    t(page, 70, 774, "Strona"); t(page, 170, 774, `${page} z 2`);
  };
  const footer = (page: number) => t(page, 70, 60, "Infolinia Banku jest dostępna pod numerami: 12 345 67 89", 400);
  pageHeader(1);
  t(1, 328, 506, "Uznania ogółem:"); t(1, 529, 506, "8 400,00", 36);
  t(1, 328, 496, "Obciążenia ogółem:"); t(1, 529, 496, "2 126,35", 36);
  t(1, 70, 366, "DATA KSIĘGOWANIA"); t(1, 163, 366, "OPIS"); t(1, 465, 366, "KWOTA", 30); t(1, 535, 366, "SALDO", 30);
  t(1, 70, 356, "DATA OPERACJI"); t(1, 163, 356, "OPERACJI"); t(1, 455, 356, "OPERACJI", 40); t(1, 516, 356, "KSIĘGOWE", 49);
  // 1: płatność kartą
  t(1, 71, 335, "2026.10.02"); t(1, 163, 335, "TRANSAKCJA KARTĄ DEBETOWĄ", 146); amount(1, 335, "-106,35", "1 000,00");
  t(1, 71, 325, "2026.09.30");
  t(1, 163, 315, "BIEDRONKA 3021 Wroclaw POL", 110); t(1, 279, 315, "5102 XXXX XXXX 1111 Data", 115);
  t(1, 163, 305, "transakcji: 2026-09-30 Kwota w walucie rozliczeniowej:", 226); t(1, 394, 305, "Kod", 15);
  t(1, 163, 295, "MCC: 5411 Kwota i waluta oryginalna transakcji: 106.35PLN", 239);
  // 2: przelew przychodzący
  t(1, 71, 273, "2026.10.10"); t(1, 163, 273, "PRZELEW KRAJOWY", 90); amount(1, 273, "8 400,00", "9 400,00");
  t(1, 71, 263, "2026.10.10");
  t(1, 163, 253, "11 2222 3333 4444 5555 6666 7777 FIRMA TESTOWA", 222); t(1, 163, 243, "Wynagrodzenie 10/2026", 106);
  footer(1);
  // strona 2: nagłówek strony nie może trafić do opisu
  pageHeader(2);
  t(2, 71, 696, "2026.10.15"); t(2, 163, 696, "PRZELEW KRAJOWY", 90); amount(2, 696, "-2 020,00", "7 380,00");
  t(2, 71, 686, "2026.10.15");
  t(2, 163, 676, "99 8888 7777 6666 5555 4444 3333 SM ZACISZE", 222); t(2, 163, 666, "czynsz 10/2026", 80);
  footer(2);
  t(2, 230, 400, "Zestawienie opłat", 90);
  t(2, 163, 380, "To już nie jest operacja 1,00", 120);
  return items;
}

describe("wyciąg PDF (układ Alior Banku, zmyślone dane)", () => {
  it("składa operacje z wierszy, bierze datę operacji, sumy zgadzają się z nagłówkiem", () => {
    const s = parsePdfStatement(aliorPdf());
    expect(s.lines).toHaveLength(3);
    expect(s.lines[0]).toMatchObject({ day: "2026-09-30", amount: 106.35, kind: "expense" });
    expect(s.lines[0].text).toBe("TRANSAKCJA KARTĄ DEBETOWĄ · BIEDRONKA 3021 Wroclaw POL · MCC 5411");
    expect(s.lines[1]).toMatchObject({ day: "2026-10-10", amount: 8400, kind: "income" });
    expect(s.lines[1].text).toBe("PRZELEW KRAJOWY · FIRMA TESTOWA Wynagrodzenie 10/2026");
    expect(s.lines[2].text).toBe("PRZELEW KRAJOWY · SM ZACISZE czynsz 10/2026");
    expect(s.period).toBe("2026.10.01 - 2026.10.31");
    expect(s.declared).toEqual({ credit: 8400, debit: 2126.35 });
    expect(s.parsed).toEqual(s.declared);
  });

  it("PDF bez tabeli operacji → pusto", () => {
    expect(parsePdfStatement([{ page: 1, x: 70, y: 700, w: 100, str: "Faktura VAT" }]).lines).toEqual([]);
  });

  it("czyści opis BLIK", () => {
    expect(tidyDescription("BLIK - PŁATNOŚĆ W INTERNECIE", "sklep.pl 00-001 Warszawa BLIK /OPT/X///// XX123XX#Order WEB_PURCHASE"))
      .toBe("BLIK - PŁATNOŚĆ W INTERNECIE · sklep.pl 00-001 Warszawa");
  });
});
