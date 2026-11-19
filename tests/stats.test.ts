import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, monthRange } from "../src/engine/dates";
import { parseAmount, sum } from "../src/engine/money";
import { budgets, byCategory, cumulative, forecast, monthly, topMerchants, totals } from "../src/engine/stats";
import type { Category, Transaction } from "../src/engine/types";

const cat = (id: number, name: string, limit: number | null = null, kind: "expense" | "income" = "expense"): Category =>
  ({ id, name, kind, icon: "Ellipsis", color: "#000", monthly_limit: limit, position: id, archived: false });
let nextId = 1;
const tx = (day: string, amount: number, category_id: number | null, kind: "expense" | "income" = "expense", merchant: string | null = null): Transaction =>
  ({ id: nextId++, day, amount, kind, category_id, merchant, note: null, receipt_id: null });

const cats = [cat(1, "Spożywcze", 1000), cat(2, "Paliwo"), cat(3, "Pensja", null, "income")];
const txs = [
  tx("2026-11-01", 100.1, 1, "expense", "Biedronka"),
  tx("2026-11-02", 0.2, 1, "expense", "BIEDRONKA "),
  tx("2026-11-03", 250, 2, "expense", "Orlen"),
  tx("2026-11-10", 5000, 3, "income"),
  tx("2026-10-05", 300, 1),
  tx("2026-10-31", 50, null),
];

describe("kwoty", () => {
  it("sumuje w groszach bez błędów zaokrągleń", () => {
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(totals(txs.slice(0, 2)).expense).toBe(100.3);
  });
  it("czyta polski zapis kwoty", () => {
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("1 234,99 zł")).toBe(1234.99);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1,234")).toBeNull();
  });
});

describe("daty", () => {
  it("przechodzi przez granicę roku", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("statystyki", () => {
  it("liczy saldo miesiąca", () => {
    const t = totals(txs.filter((x) => x.day.startsWith("2026-11")));
    expect(t).toEqual({ expense: 350.3, income: 5000, balance: 4649.7, count: 4 });
  });

  it("grupuje po kategoriach malejąco, z udziałem i „bez kategorii”", () => {
    const r = byCategory(txs, cats);
    expect(r.map((x) => x.category?.name ?? null)).toEqual(["Spożywcze", "Paliwo", null]);
    expect(r[0].amount).toBe(400.3);
    expect(r.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
  });

  it("kategoria usunięta z listy liczy się jako „bez kategorii”", () => {
    const r = byCategory([tx("2026-11-01", 10, 99)], cats);
    expect(r[0].category).toBeNull();
  });

  it("zestawia miesiące, także dla jednej kategorii", () => {
    const m = monthly(txs, ["2026-10", "2026-11"]);
    expect(m.map((x) => x.expense)).toEqual([350, 350.3]);
    expect(m[1].income).toBe(5000);
    expect(monthly(txs, ["2026-10", "2026-11"], 2).map((x) => x.expense)).toEqual([0, 250]);
  });

  it("wydatki narastająco: bieżący miesiąc tylko do dzisiaj", () => {
    const c = cumulative(txs, "2026-11", "2026-10", 3);
    expect(c).toHaveLength(31);
    expect(c[2]).toEqual({ day: 3, current: 350.3, previous: 0 });
    expect(c[3].current).toBeNull();
    expect(c[30]).toEqual({ day: 31, current: null, previous: 350 });
  });

  it("łączy sklepy różniące się wielkością liter i spacjami", () => {
    const s = topMerchants(txs);
    expect(s[0]).toEqual({ merchant: "Orlen", amount: 250, count: 1 });
    expect(s[1]).toMatchObject({ merchant: "Biedronka", amount: 100.3, count: 2 });
  });

  it("limity: wykorzystanie i przekroczenia", () => {
    const b = budgets([tx("2026-11-01", 1200, 1)], cats);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ spent: 1200, limit: 1000 });
    expect(b[0].ratio).toBeCloseTo(1.2);
  });

  it("prognoza dopiero od 5. dnia", () => {
    expect(forecast(100, "2026-11", 3)).toBeNull();
    expect(forecast(1000, "2026-11", 10)).toBe(3000);
    expect(forecast(1000, "2026-11", 30)).toBe(1000);
  });
});
