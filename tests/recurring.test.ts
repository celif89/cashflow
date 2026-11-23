import { describe, expect, it } from "vitest";
import {
  dueDates, frequencyLabel, installmentNo, installmentStatus, isScheduled, lastDue, staleDues, matchRecurring, missingDues, monthlyCost, nextDue, nthDue,
  plannedCumulative, recurringRef, refOf, resetInstallments, suggestRecurring, upcoming,
} from "../src/engine/recurring";
import { donutSlices, type CategoryTotal } from "../src/engine/stats";
import type { Category, Recurring, Transaction } from "../src/engine/types";

const rec = (p: Partial<Recurring>): Recurring => ({
  id: 1, name: "Netflix", kind: "expense", amount: 43, variable_amount: false, category_id: 10, merchant: "Netflix",
  every_months: 1, start_date: "2026-09-15", end_date: null, active: true, ...p,
});
let id = 100;
const tx = (p: Partial<Transaction>): Transaction => ({ id: id++, day: "2026-11-01", amount: 10, kind: "expense", category_id: 1, merchant: null, note: null, receipt_id: null, ...p });

describe("terminy", () => {
  it("ten sam dzień miesiąca; 31. → ostatni dzień krótszego miesiąca", () => {
    const r = rec({ start_date: "2026-01-31" });
    expect([0, 1, 2, 3].map((n) => nthDue(r, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("co kwartał, z datą końca", () => {
    const r = rec({ start_date: "2026-01-10", every_months: 3, end_date: "2026-10-01" });
    expect(dueDates(r, "2026-01-01", "2027-12-31")).toEqual(["2026-01-10", "2026-04-10", "2026-07-10"]);
  });
  it("następny termin", () => {
    expect(nextDue(rec({}), "2026-11-16")).toBe("2026-12-15");
    expect(nextDue(rec({}), "2026-11-15")).toBe("2026-11-15");
    expect(nextDue(rec({ end_date: "2026-10-31" }), "2026-11-01")).toBeNull();
  });
  it("opis częstotliwości", () => {
    expect(frequencyLabel(rec({}))).toBe("co miesiąc, 15. dnia");
    expect(frequencyLabel(rec({ every_months: 3, start_date: "2026-01-10" }))).toBe("co kwartał: 10 sty, kwi, lip, paź");
    expect(frequencyLabel(rec({ every_months: 12, start_date: "2026-03-15" }))).toBe("co rok, 15 marca");
  });
  it("koszt miesięczny", () => {
    expect(monthlyCost(rec({ amount: 300, every_months: 3 }))).toBe(100);
  });
});

describe("płatności do zatwierdzenia", () => {
  it("brakujące terminy do dziś – bez już zapisanych, pominiętych i wstrzymanych pozycji", () => {
    const r = rec({});
    const txs = [tx({ recurring_id: 1, recurring_due: "2026-09-15" })];
    const refs = new Set([recurringRef(1, "2026-10-15")]);
    const due = missingDues([r, rec({ id: 2, active: false })], txs, refs, "2026-11-20");
    expect(due.map((d) => d.due)).toEqual(["2026-11-15"]);
  });
  it("data startu sprzed lat → najwyżej 12 ostatnich", () => {
    expect(missingDues([rec({ start_date: "2020-01-15" })], [], new Set(), "2026-11-20")).toHaveLength(12);
  });
  it("odcisk: linia wyciągu albo termin stałej płatności", () => {
    expect(refOf(tx({ bank_ref: "abc" }))).toBe("abc");
    expect(refOf(tx({ recurring_id: 3, recurring_due: "2026-11-15" }))).toBe("rec:3:2026-11-15");
    expect(refOf(tx({}))).toBeNull();
  });
  it("najbliższe 30 dni", () => {
    const list = [rec({}), rec({ id: 2, name: "Podatek", every_months: 3, start_date: "2026-03-10", amount: 300 })];
    expect(upcoming(list, "2026-11-20", "2026-12-20").map((u) => [u.r.name, u.due])).toEqual([["Podatek", "2026-12-10"], ["Netflix", "2026-12-15"]]);
  });
});

describe("łączenie stałej płatności z wyciągiem", () => {
  const list = [rec({}), rec({ id: 2, name: "Prąd", merchant: "Tauron", variable_amount: true, category_id: 2, amount: 200 })];
  it("ta sama kwota w ciągu 4 dni – także pozycja z wyciągu, która jeszcze czeka", () => {
    const p = tx({ day: "2026-11-15", amount: 43, recurring_id: 1, recurring_due: "2026-11-15", status: "pending" });
    const bank = tx({ day: "2026-11-17", amount: 43, status: "pending", bank_ref: "b1" });
    expect(matchRecurring([p], [p, bank], list).get(p.id)?.id).toBe(bank.id);
  });
  it("kwota zmienna: po odbiorcy w opisie z banku", () => {
    const p = tx({ day: "2026-11-20", amount: 200, recurring_id: 2, recurring_due: "2026-11-20", status: "pending", merchant: "Tauron", category_id: 2 });
    const bank = tx({ day: "2026-11-22", amount: 187.42, bank_ref: "b2", bank_text: "PRZELEW · TAURON SPRZEDAZ faktura 11/2026", category_id: null });
    const other = tx({ day: "2026-11-21", amount: 55, bank_ref: "b3", bank_text: "ORLEN" });
    expect(matchRecurring([p], [bank, other], list).get(p.id)?.id).toBe(bank.id);
  });
  it("bez dopasowania przy innej kwocie (stała kwota) albo za dużej różnicy dni", () => {
    const p = tx({ day: "2026-11-15", amount: 43, recurring_id: 1, recurring_due: "2026-11-15", status: "pending" });
    expect(matchRecurring([p], [tx({ day: "2026-11-15", amount: 44 }), tx({ day: "2026-11-25", amount: 43 })], list).size).toBe(0);
  });
});

describe("wykrywanie stałych płatności w historii", () => {
  it("raz w miesiącu, podobna kwota; sklep odwiedzany kilka razy w miesiącu się nie liczy", () => {
    const txs = [
      ...["2026-08-14", "2026-09-15", "2026-10-15", "2026-11-14"].map((day) => tx({ day, amount: 43, merchant: "NETFLIX.COM", category_id: 10 })),
      ...["2026-09-20", "2026-11-19"].map((day) => tx({ day, amount: 187 + Number(day.slice(5, 7)) * 10, merchant: "Tauron", category_id: 2 })),
      tx({ day: "2026-10-21", amount: 150, merchant: "Tauron", category_id: 2 }),
      ...["2026-09-02", "2026-09-09", "2026-10-03", "2026-11-04"].map((day) => tx({ day, amount: 120, merchant: "Biedronka" })),
    ];
    const s = suggestRecurring(txs, [], "2026-11-22");
    expect(s.map((x) => x.name)).toEqual(["NETFLIX.COM", "Tauron"]);
    expect(s[0]).toMatchObject({ amount: 43, variable: false, day: 15, category_id: 10, months: 4 });
    expect(s[1].variable).toBe(true);
    expect(suggestRecurring(txs, [rec({ merchant: "netflix.com" })], "2026-11-22").map((x) => x.name)).toEqual(["Tauron"]);
  });
});

describe("wykres kołowy", () => {
  const cat = (id: number, color: string): Category => ({ id, name: `K${id}`, kind: "expense", icon: "Ellipsis", color, monthly_limit: null, position: id, archived: false });
  const row = (c: Category | null, amount: number): CategoryTotal => ({ category: c, amount, count: 1, share: amount / 1000 });
  const pal = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  it("do 6 kategorii bez „Pozostałe”; powtórzony kolor zastąpiony wolnym z palety", () => {
    const s = donutSlices([row(cat(1, "#2a78d6"), 500), row(cat(2, "#2a78d6"), 300), row(null, 200)], pal);
    expect(s.map((x) => x.color)).toEqual(["#2a78d6", "#eb6834", "#64748b"]);
  });
  it("więcej niż 6 → 5 największych + Pozostałe z sumą reszty", () => {
    const rows = [300, 200, 150, 100, 90, 80, 50, 30].map((a, i) => row(cat(i + 1, pal[i]), a));
    const s = donutSlices(rows, pal);
    expect(s).toHaveLength(6);
    expect(s[5]).toMatchObject({ key: "rest", name: "Pozostałe", amount: 160, others: 3 });
    expect(s[5].share).toBeCloseTo(0.16);
  });
});

describe("plan stałych wydatków na miesiąc", () => {
  it("narastająco dzień po dniu, tylko aktywne wydatki przypadające w tym miesiącu", () => {
    const list = [
      rec({ id: 1, amount: 43, start_date: "2026-01-15" }), // co miesiąc 15.
      rec({ id: 2, name: "Czynsz", amount: 1850, start_date: "2026-01-05" }),
      rec({ id: 3, name: "Podatek", amount: 312, every_months: 3, start_date: "2026-03-15" }), // mar, cze, wrz, gru
      rec({ id: 4, name: "Woda", amount: 90, every_months: 2, start_date: "2026-01-20" }), // sty, mar, … lis – nie w grudniu
      rec({ id: 5, name: "Wypłata", kind: "income", amount: 8400, start_date: "2026-01-10" }),
      rec({ id: 6, name: "Siłownia", amount: 120, active: false, start_date: "2026-01-01" }),
      rec({ id: 7, name: "Kurs", amount: 200, start_date: "2026-01-31" }), // grudzień ma 31 dni
    ];
    const p = plannedCumulative(list, "2026-12");
    expect(p.byDay).toHaveLength(31);
    expect(p.count).toBe(4);
    expect(p.variable).toBe(0);
    expect(p.total).toBe(43 + 1850 + 312 + 200);
    expect(p.byDay[3]).toBe(0);
    expect(p.byDay[4]).toBe(1850);
    expect(p.byDay[14]).toBe(1850 + 43 + 312);
    expect(p.byDay[30]).toBe(2405);
  });
});

describe("raty", () => {
  // kosiarka: 10 rat po 150 zł, 8 spłaconych, 9. rata 5 grudnia
  const mower = rec({ id: 9, name: "Kosiarka", amount: 150, start_date: "2026-12-05", installments_total: 10, installments_paid_before: 8 });

  it("harmonogram kończy się po ostatniej racie", () => {
    expect(dueDates(mower, "2026-01-01", "2027-12-31")).toEqual(["2026-12-05", "2027-01-05"]);
    expect(lastDue(mower)).toBe("2027-01-05");
    expect(nextDue(mower, "2027-01-06")).toBeNull();
    expect(upcoming([mower], "2027-01-06", "2027-03-01")).toEqual([]);
  });

  it("numer raty w terminie", () => {
    expect(installmentNo(mower, "2026-12-05")).toBe(9);
    expect(installmentNo(mower, "2027-01-05")).toBe(10);
    expect(installmentNo(mower, "2027-02-05")).toBeNull();
    expect(installmentNo(rec({}), "2026-12-15")).toBeNull();
  });

  it("postęp: zatwierdzone raty się doliczają, czekające nie", () => {
    const t9 = tx({ recurring_id: 9, recurring_due: "2026-12-05", amount: 150 });
    const t10 = tx({ recurring_id: 9, recurring_due: "2027-01-05", amount: 150, status: "pending" });
    expect(installmentStatus(mower, [])).toMatchObject({ total: 10, paid: 8, pending: 0, remaining: 2, remainingAmount: 300, done: false });
    expect(installmentStatus(mower, [t9, t10])).toMatchObject({ paid: 9, pending: 1, remaining: 1, remainingAmount: 150 });
    expect(installmentStatus(mower, [t9, { ...t10, status: "confirmed" }])).toMatchObject({ paid: 10, remaining: 0, done: true });
    expect(installmentStatus(rec({}), [])).toBeNull();
  });

  it("po ostatniej racie nic nie trafia do sprawdzenia ani do planu", () => {
    expect(missingDues([mower], [], new Set(), "2027-06-30").map((d) => d.due)).toEqual(["2026-12-05", "2027-01-05"]);
    expect(plannedCumulative([mower], "2027-02").total).toBe(0);
    expect(plannedCumulative([mower], "2027-01").total).toBe(150);
  });

  it("wszystko spłacone od razu → żadnych terminów", () => {
    const paid = { ...mower, installments_paid_before: 10 };
    expect(dueDates(paid, "2026-01-01", "2030-01-01")).toEqual([]);
    expect(lastDue(paid)).toBeNull();
  });

  it("poprawka „spłacono X”: start od następnego terminu po dziś", () => {
    const loan = rec({ id: 10, amount: 220.7, start_date: "2026-01-03", installments_total: 24, installments_paid_before: 0 });
    expect(resetInstallments(loan, 11, "2026-11-23")).toEqual({ start_date: "2026-12-03", installments_paid_before: 11 });
    expect(resetInstallments(loan, 99, "2026-11-23").installments_paid_before).toBe(24);
    const after = { ...loan, ...resetInstallments(loan, 11, "2026-11-23") };
    expect(lastDue(after)).toBe("2027-12-03"); // 13 rat od grudnia 2026
    // raty zatwierdzone przed nowym startem nie liczą się drugi raz
    expect(installmentStatus(after, [tx({ recurring_id: 10, recurring_due: "2026-11-03" })])?.paid).toBe(11);
  });
});

describe("zmiana harmonogramu", () => {
  // kredyt zapisany najpierw z dzisiejszą datą, potem przesunięty na 21 grudnia
  const loan = rec({ id: 11, name: "Kredyt", amount: 300, start_date: "2026-12-21", installments_total: 24, installments_paid_before: 0 });

  it("termin należy do harmonogramu tylko w dniu raty i w jej zakresie", () => {
    expect(isScheduled(loan, "2026-12-21")).toBe(true);
    expect(isScheduled(loan, "2028-11-21")).toBe(true); // 24. rata
    expect(isScheduled(loan, "2028-12-21")).toBe(false); // 25. – już nie
    expect(isScheduled(loan, "2026-11-23")).toBe(false); // sprzed startu
    expect(isScheduled(loan, "2027-01-20")).toBe(false); // inny dzień
  });

  it("czekająca „rata” z dawnej daty jest do usunięcia i nie liczy się jako spłacona", () => {
    const orphan = tx({ recurring_id: 11, recurring_due: "2026-11-23", status: "pending", amount: 300 });
    const confirmedOrphan = tx({ recurring_id: 11, recurring_due: "2026-11-23", amount: 300 });
    expect(staleDues(loan, [orphan, tx({ recurring_id: 11, recurring_due: "2026-12-21", status: "pending" })]).map((t) => t.id)).toEqual([orphan.id]);
    expect(installmentStatus(loan, [confirmedOrphan])).toMatchObject({ paid: 0, remaining: 24 });
  });
});

describe("raty zapisane z góry", () => {
  it("wpis w terminie raty, który jeszcze nie nadszedł, nie liczy się jako spłacony", () => {
    const loan = rec({ id: 12, amount: 300, start_date: "2026-12-21", installments_total: 24, installments_paid_before: 0 });
    const early = tx({ recurring_id: 12, recurring_due: "2026-12-21", day: "2026-12-21", amount: 300 });
    expect(installmentStatus(loan, [early], "2026-11-23")).toMatchObject({ paid: 0, ahead: 1, remaining: 24 });
    expect(installmentStatus(loan, [early], "2026-12-21")).toMatchObject({ paid: 1, ahead: 0, remaining: 23 });
  });
});
