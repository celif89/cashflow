import { describe, expect, it } from "vitest";
import { groupByCategory, itemsGap, receiptTransactions, sanitizeScan } from "../src/engine/receipt";
import { transactionsCsv } from "../src/lib/csv";
import type { Category } from "../src/engine/types";

const cat = (id: number, name: string, kind: "expense" | "income" = "expense", archived = false): Category =>
  ({ id, name, kind, icon: "Ellipsis", color: "#000", monthly_limit: null, position: id, archived });
const cats = [cat(1, "Spożywcze"), cat(2, "Chemia"), cat(3, "Inne"), cat(4, "Pensja", "income"), cat(5, "Stara", "expense", true)];

describe("odczyt paragonu", () => {
  it("czyści odpowiedź: nieznane i archiwalne kategorie, zerowe pozycje, data z przyszłości", () => {
    const r = sanitizeScan({
      merchant: "  Biedronka ", date: "2030-01-01", total: 20,
      items: [
        { name: "Mleko", amount: 4.29, category_id: 1 },
        { name: "Pensja?", amount: 1, category_id: 4 },
        { name: "Stare", amount: 2, category_id: 5 },
        { name: "", amount: 0, category_id: 2 },
      ],
    }, cats, "2026-11-19");
    expect(r.merchant).toBe("Biedronka");
    expect(r.date).toBe("2026-11-19");
    expect(r.items).toEqual([
      { name: "Mleko", amount: 4.29, category_id: 1 },
      { name: "Pensja?", amount: 1, category_id: null },
      { name: "Stare", amount: 2, category_id: null },
    ]);
  });

  it("brak sumy → suma pozycji", () => {
    const r = sanitizeScan({ merchant: null, date: null, total: 0, items: [{ name: "A", amount: 1.1, category_id: 1 }, { name: "B", amount: 2.2, category_id: 1 }] }, cats, "2026-11-19");
    expect(r.total).toBe(3.3);
    expect(r.date).toBe("2026-11-19");
  });
});

describe("rozbijanie paragonu na kategorie", () => {
  const receipt = {
    merchant: "Biedronka", day: "2026-11-18", total: 30,
    items: [
      { name: "Chleb", amount: 5.5, category_id: 1 },
      { name: "Ser", amount: 12.99, category_id: 1 },
      { name: "Rabat ser", amount: -2, category_id: 1 },
      { name: "Płyn do naczyń", amount: 8.49, category_id: 2 },
      { name: "Torba", amount: 1, category_id: null },
    ],
  };

  it("sumuje grupy z rabatami, różnicę dolicza do największej", () => {
    expect(itemsGap(receipt)).toBe(4.02);
    const g = groupByCategory(receipt);
    expect(g.map((x) => [x.category_id, x.amount])).toEqual([[1, 20.51], [2, 8.49], [null, 1]]);
    expect(g.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(30);
  });

  it("tworzy jedną transakcję na kategorię, bez kategorii → „Inne”", () => {
    const rows = receiptTransactions(receipt, true, cats, 3);
    expect(rows.map((r) => [r.category_id, r.amount])).toEqual([[1, 20.51], [2, 8.49], [3, 1]]);
    expect(rows[0].note).toBe("Chleb, Ser, Rabat ser");
    expect(rows.every((r) => r.merchant === "Biedronka" && r.day === "2026-11-18")).toBe(true);
  });

  it("albo jedną transakcję na cały paragon w głównej kategorii", () => {
    const rows = receiptTransactions(receipt, false, cats, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 30, category_id: 1 });
  });
});

describe("eksport CSV", () => {
  it("średniki, przecinek dziesiętny, minus dla wydatków, cudzysłowy", () => {
    const csv = transactionsCsv([
      { id: 2, day: "2026-11-02", amount: 12.5, kind: "expense", category_id: 1, merchant: "Sklep; „Pod lipą”", note: null, receipt_id: 7 },
      { id: 1, day: "2026-11-01", amount: 5000, kind: "income", category_id: 4, merchant: null, note: "listopad", receipt_id: null },
    ], cats);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[1]).toBe("2026-11-01;przychód;5000,00;Pensja;;listopad;");
    expect(lines[2]).toBe("2026-11-02;wydatek;-12,50;Spożywcze;\"Sklep; „Pod lipą”\";;tak");
  });
});
