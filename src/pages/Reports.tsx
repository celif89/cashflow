import { ChartColumn } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bars, RankBars, usePalette } from "../components/charts";
import { Card, EmptyState, PageHeader, Segmented } from "../components/ui";
import { monthOf, monthRange, thisMonth } from "../engine/dates";
import { byCategory, monthly, topMerchants } from "../engine/stats";
import { useData } from "../lib/DataContext";
import { axisMoney, money, moneyRound, monthName, monthShort, percent } from "../lib/format";
import { CategoryIcon } from "../lib/icons";

type Range = "6" | "12" | "24";

export function ReportsPage() {
  const { data, activeCategories, categoryById } = useData();
  const navigate = useNavigate();
  const p = usePalette();
  const [range, setRange] = useState<Range>("12");
  const expenseCats = activeCategories("expense");
  const [catId, setCatId] = useState<number | null>(expenseCats[0]?.id ?? null);

  const r = useMemo(() => {
    // zaczynamy od pierwszego miesiąca z danymi – bez pustych słupków sprzed rozpoczęcia budżetu
    const first = data!.transactions.reduce((a, t) => (t.day < a ? t.day : a), thisMonth() + "-99").slice(0, 7);
    const inRange = monthRange(thisMonth(), Number(range)).filter((m) => m >= first);
    const months = inRange.length ? inRange : [thisMonth()];
    const from = months[0];
    const txs = data!.transactions.filter((t) => monthOf(t.day) >= from);
    const series = monthly(txs, months);
    // średnie liczymy tylko z miesięcy, w których w ogóle coś wpisano
    const active = series.filter((s) => s.expense > 0 || s.income > 0).length || 1;
    return {
      months, series, active,
      cats: byCategory(txs, data!.categories),
      trend: catId !== null ? monthly(txs, months, catId) : [],
      shops: topMerchants(txs, 10),
      sumExpense: series.reduce((a, s) => a + s.expense, 0),
      sumIncome: series.reduce((a, s) => a + s.income, 0),
    };
  }, [data, range, catId]);

  if (data!.transactions.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Raporty" title="Wykresy i podsumowania" />
        <Card><EmptyState icon={<ChartColumn className="size-7" />} title="Za mało danych">Raporty pojawią się po dodaniu pierwszych transakcji.</EmptyState></Card>
      </>
    );
  }

  const trendCat = catId !== null ? categoryById.get(catId) : undefined;
  const trendAvg = r.trend.reduce((a, s) => a + s.expense, 0) / r.active;

  return (
    <>
      <PageHeader eyebrow="Raporty" title="Wykresy i podsumowania"
        subtitle={`${monthName(r.months[0])} – ${monthName(r.months[r.months.length - 1])}`}
        actions={<Segmented value={range} onChange={setRange} options={[{ value: "6", label: "6 mies." }, { value: "12", label: "12 mies." }, { value: "24", label: "24 mies." }]} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Wydatki i przychody" subtitle="Kliknij miesiąc, żeby otworzyć jego pulpit">
          <Bars data={r.series} x="month" fmt={money} axisFmt={axisMoney} labelFmt={monthShort}
            onPick={(m) => navigate(m === thisMonth() ? "/" : `/?m=${m}`)}
            series={[{ key: "expense", name: "Wydatki", color: p.s1 }, { key: "income", name: "Przychody", color: p.s3 }]} />
        </Card>
        <Card title="Podsumowanie okresu">
          <dl className="space-y-3 text-sm">
            <Row label="Wydatki razem" value={money(r.sumExpense)} />
            <Row label="Przychody razem" value={money(r.sumIncome)} />
            <Row label="Saldo" value={`${r.sumIncome - r.sumExpense < 0 ? "−" : ""}${money(Math.abs(r.sumIncome - r.sumExpense))}`} />
            <div className="border-t border-slate-100 pt-3 dark:border-white/5" />
            <Row label="Średnio wydatki / miesiąc" value={moneyRound(r.sumExpense / r.active)} />
            <Row label="Średnio przychody / miesiąc" value={moneyRound(r.sumIncome / r.active)} />
            {r.sumIncome > 0 && <Row label="Oszczędzono" value={percent(Math.max(0, (r.sumIncome - r.sumExpense) / r.sumIncome))} />}
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Kategorie w całym okresie" subtitle="Suma i średnia miesięczna">
          {r.cats.length === 0 ? <p className="text-sm text-slate-500">Brak wydatków.</p> : (
            <RankBars fmt={moneyRound} onPick={(k) => k !== "none" && setCatId(Number(k))}
              rows={r.cats.map((c) => ({
                key: String(c.category?.id ?? "none"),
                label: <><CategoryIcon icon={c.category?.icon} color={c.category?.color} size="sm" /><span className="truncate">{c.category?.name ?? "Bez kategorii"}</span></>,
                value: c.amount,
                hint: `${moneyRound(c.amount / r.active)}/mies.`,
              }))} />
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Trend kategorii" subtitle={trendCat ? `średnio ${moneyRound(trendAvg)} miesięcznie${trendCat.monthly_limit ? ` · limit ${moneyRound(trendCat.monthly_limit)}` : ""}` : undefined}
            actions={
              <select className="input w-auto py-1.5 text-sm" value={catId ?? ""} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : null)}>
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            }>
            {trendCat
              ? <Bars data={r.trend} x="month" fmt={money} axisFmt={axisMoney} labelFmt={monthShort} height={200}
                  series={[{ key: "expense", name: trendCat.name, color: p.s1 }]} />
              : <p className="text-sm text-slate-500">Wybierz kategorię.</p>}
          </Card>

          <Card title="Gdzie wydajesz najwięcej" subtitle="Sklepy i odbiorcy">
            {r.shops.length === 0
              ? <p className="text-sm text-slate-500 dark:text-slate-400">Wpisuj sklep przy wydatkach (albo skanuj paragony), a tutaj zobaczysz ranking.</p>
              : <RankBars fmt={moneyRound} rows={r.shops.map((s) => ({ key: s.merchant, label: <span className="truncate">{s.merchant}</span>, value: s.amount, hint: `${s.count}×` }))} />}
          </Card>
        </div>
      </div>

      <Card className="mt-4" title="Tabela miesięcy" pad={false}>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                <th className="px-3 py-2.5">Miesiąc</th><th className="px-3 py-2.5 text-right">Wydatki</th><th className="px-3 py-2.5 text-right">Przychody</th><th className="px-3 py-2.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[...r.series].reverse().map((s) => (
                <tr key={s.month} className="cursor-pointer border-t border-slate-100 hover:bg-slate-900/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                  onClick={() => navigate(s.month === thisMonth() ? "/" : `/?m=${s.month}`)}>
                  <td className="px-3 py-2 capitalize">{monthName(s.month)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(s.expense)}</td>
                  <td className="px-3 py-2 text-right tnum">{money(s.income)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tnum ${s.balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                    {s.balance < 0 ? "−" : ""}{money(Math.abs(s.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold tnum">{value}</dd></div>;
}
