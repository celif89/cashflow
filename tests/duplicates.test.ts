import { describe, expect, it } from "vitest";
import { findDuplicate, sameReceipt } from "../src/engine/duplicates";
import type { Receipt, Recurring, Transaction } from "../src/engine/types";

let id = 1;
const tx = (p: Partial<Transaction>): Transaction => ({ id: id++, day: "2026-11-15", amount: 43, kind: "expense", category_id: 10, merchant: "Netflix", note: null, receipt_id: null, ...p });
const rec = (p: Partial<Recurring>): Recurring => ({ id: 7, name: "Netflix", kind: "expense", amount: 43, variable_amount: false, category_id: 10, merchant: "Netflix", every_months: 1, start_date: "2026-01-15", end_date: null, active: true, ...p });
const cand = (p: Partial<Parameters<typeof findDuplicate>[0]>) => ({ day: "2026-11-20", amount: 43, kind: "expense" as const, merchant: "Netflix", category_id: 10, ...p });

describe("ostrzeżenie przed podwójnym wpisem", () => {
  it("ten sam sklep i ta sama kwota w tym samym miesiącu (wielkość liter nie ma znaczenia)", () => {
    const d = findDuplicate(cand({ merchant: "NETFLIX" }), [tx({})], []);
    expect(d?.reason).toBe("same");
    expect(d?.items).toHaveLength(1);
  });

  it("inny miesiąc albo inny rodzaj (przychód) – bez ostrzeżenia", () => {
    expect(findDuplicate(cand({ day: "2026-12-01" }), [tx({})], [])).toBeNull();
    expect(findDuplicate(cand({ kind: "income" }), [tx({})], [])).toBeNull();
  });

  it("Biedronka drugi raz w miesiącu z inną kwotą to norma", () => {
    const hist = ["2026-09-03", "2026-09-10", "2026-10-02", "2026-11-04"].map((day) => tx({ day, merchant: "Biedronka", amount: 80 + Number(day.slice(8)) }));
    expect(findDuplicate(cand({ merchant: "Biedronka", amount: 55.2 }), hist, [])).toBeNull();
  });

  it("stała płatność, która w tym miesiącu już jest – niezależnie od kwoty, także gdy czeka na zatwierdzenie", () => {
    const pending = tx({ status: "pending", recurring_id: 7, recurring_due: "2026-11-15", merchant: "Netflix" });
    const d = findDuplicate(cand({ amount: 49 }), [pending], [rec({})]);
    expect(d?.reason).toBe("recurring");
    expect(d?.items[0].id).toBe(pending.id);
  });

  it("nazwa wpisana inaczej niż w stałej płatności („Netflix.com”) też się rozpozna", () => {
    expect(findDuplicate(cand({ merchant: "Netflix com", amount: 49 }), [tx({ recurring_id: 7 })], [rec({})])?.reason).toBe("recurring");
  });

  it("sklep, w którym płacisz raz w miesiącu – ostrzeżenie mimo innej kwoty", () => {
    const hist = [tx({ day: "2026-09-12", merchant: "Tauron", amount: 190 }), tx({ day: "2026-10-12", merchant: "Tauron", amount: 210 }), tx({ day: "2026-11-12", merchant: "Tauron", amount: 205 })];
    expect(findDuplicate(cand({ merchant: "Tauron", amount: 199 }), hist, [])?.reason).toBe("monthly");
  });

  it("bez sklepu: ta sama kategoria i kwota tego samego dnia", () => {
    const t = tx({ merchant: null, day: "2026-11-20" });
    expect(findDuplicate(cand({ merchant: null }), [t], [])?.reason).toBe("same");
    expect(findDuplicate(cand({ merchant: null, day: "2026-11-21" }), [t], [])).toBeNull();
  });

  it("edytowany wpis nie jest duplikatem samego siebie", () => {
    const t = tx({});
    expect(findDuplicate(cand({ excludeId: t.id }), [t], [rec({})])).toBeNull();
  });
});

describe("ten sam paragon drugi raz", () => {
  const r: Receipt = { id: 1, day: "2026-11-18", merchant: "Biedronka", total: 106.35, image_path: null, items: [] };
  it("ta sama suma, sklep, do dnia różnicy", () => {
    expect(sameReceipt({ day: "2026-11-19", total: 106.35, merchant: "BIEDRONKA" }, [r])?.id).toBe(1);
    expect(sameReceipt({ day: "2026-11-18", total: 106.36, merchant: "Biedronka" }, [r])).toBeNull();
    expect(sameReceipt({ day: "2026-11-18", total: 106.35, merchant: "Lidl" }, [r])).toBeNull();
    expect(sameReceipt({ day: "2026-11-21", total: 106.35, merchant: "Biedronka" }, [r])).toBeNull();
  });
});
