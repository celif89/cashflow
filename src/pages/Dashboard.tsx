import { ArrowRight, Plus, ScanLine, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lines, RankBars, usePalette } from "../components/charts";
import { MonthPicker, TransactionList } from "../components/finance";
import { Card, EmptyState, PageHeader, Stat } from "../components/ui";
import { addMonths, daysInMonth, thisMonth, today } from "../engine/dates";
import { budgets, byCategory, cumulative, forecast, inMonth, totals } from "../engine/stats";
import { useData } from "../lib/DataContext";
import { axisMoney, money, moneyRound, monthName, percent, txCount } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { useMonthParam } from "../lib/month";

export function Dashboard() {
  const { data, openEditor } = useData();
  const [month, setMonth] = useMonthParam();
  const navigate = useNavigate();
  const p = usePalette();
  const txs = data!.transactions;
  const categories = data!.categories;
  const prev = addMonths(month, -1);
  const isNow = month === thisMonth();
  const upto = isNow ? Number(today().slice(8, 10)) : daysInMonth(month);

  const m = useMemo(() => {
    const cur = inMonth(txs, month);
    const before = inMonth(txs, prev);
    const t = totals(cur), tp = totals(before);
    // porównanie z poprzednim miesiącem „do tego samego dnia”, żeby 10 listopada nie zestawiać z całym październikiem
    const prevSameDay = totals(before.filter((x) => Number(x.day.slice(8, 10)) <= upto)).expense;
    return {
      cur, t, tp, prevSameDay,
      cats: byCategory(cur, categories),
      budgetRows: budgets(cur, categories),
      line: cumulative(txs, month, prev, upto),
      fc: isNow ? forecast(t.expense, month, upto) : null,
    };
  }, [txs, categories, month, prev, upto, isNow]);

  if (txs.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Budżet domowy" title="Witaj w Cashflow" subtitle="Zacznij od pierwszego wydatku albo zeskanuj paragon." />
        <Card>
          <EmptyState icon={<Wallet className="size-7" />} title="Nie ma jeszcze żadnych transakcji"
            action={<div className="flex flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={() => openEditor()}><Plus className="size-4" /> Dodaj wydatek</button>
              <Link className="btn btn-secondary" to="/skanuj"><ScanLine className="size-4" /> Skanuj paragon</Link>
              <button className="btn btn-ghost" onClick={() => openEditor({ kind: "income" })}>Dodaj przychód</button>
            </div>}>
            Kategorie są już przygotowane – zmienisz je w Ustawieniach. Wpisz też wynagrodzenie jako przychód, wtedy zobaczysz saldo miesiąca.
          </EmptyState>
        </Card>
      </>
    );
  }

  const diff = m.t.expense - m.prevSameDay;
  const recent = m.cur.slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Pulpit" title={<span className="capitalize">{monthName(month)}</span>}
        actions={<MonthPicker month={month} onChange={setMonth} />} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Wydatki" icon={<TrendingDown className="size-4" />} value={moneyRound(m.t.expense)}
          hint={m.prevSameDay > 0
            ? <span className={diff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                {diff > 0 ? "▲" : "▼"} {moneyRound(Math.abs(diff))} {isNow ? "vs ten sam okres w poprz. miesiącu" : "vs poprzedni miesiąc"}
              </span>
            : txCount(m.cur.filter((x) => x.kind === "expense").length)} />
        <Stat label="Przychody" icon={<TrendingUp className="size-4" />} value={moneyRound(m.t.income)}
          hint={m.t.income === 0 ? <button className="underline" onClick={() => openEditor({ kind: "income", day: isNow ? today() : `${month}-01` })}>dodaj przychód</button> : undefined} />
        <Stat label="Saldo" icon={<Wallet className="size-4" />} value={`${m.t.balance < 0 ? "−" : ""}${moneyRound(Math.abs(m.t.balance))}`}
          tone={m.t.balance < 0 ? "warn" : "good"}
          hint={m.t.income > 0 ? `wydano ${percent(m.t.expense / m.t.income)} przychodów` : undefined} />
        {m.fc !== null
          ? <Stat label="Prognoza na koniec miesiąca" value={moneyRound(m.fc)} hint={`przy obecnym tempie · ${moneyRound(m.t.expense / upto)} dziennie`} />
          : <Stat label="Średnio dziennie" value={moneyRound(m.t.expense / Math.max(upto, 1))} hint={`poprzedni miesiąc: ${moneyRound(m.tp.expense)}`} />}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Wydatki narastająco" subtitle={`${monthName(month)} na tle ${monthName(prev)}`}>
          <Lines data={m.line} x="day" height={300} fmt={money} axisFmt={axisMoney} labelFmt={(d) => `${d}. dzień`}
            series={[
              { key: "current", name: monthName(month), color: p.s1 },
              { key: "previous", name: monthName(prev), color: p.muted, dashed: true },
            ]} />
        </Card>

        <Card className="lg:col-span-2" title="Na co idą pieniądze" subtitle="Kliknij kategorię, żeby zobaczyć transakcje">
          {m.cats.length === 0
            ? <p className="text-sm text-slate-500">Brak wydatków w tym miesiącu.</p>
            : <RankBars fmt={moneyRound}
                onPick={(key) => navigate(`/transakcje?${new URLSearchParams({ ...(month !== thisMonth() ? { m: month } : {}), k: key })}`)}
                rows={m.cats.slice(0, 8).map((r) => ({
                  key: String(r.category?.id ?? "none"),
                  label: <><CategoryIcon icon={r.category?.icon} color={r.category?.color} size="sm" /><span className="truncate">{r.category?.name ?? "Bez kategorii"}</span></>,
                  value: r.amount,
                  hint: percent(r.share),
                  limit: r.category?.monthly_limit,
                }))} />}
          {m.cats.length > 8 && <p className="mt-3 text-xs text-slate-500">+ {m.cats.length - 8} pozostałych kategorii w Raportach</p>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Ostatnie transakcje" pad={false}
          actions={<Link to={`/transakcje${month !== thisMonth() ? `?m=${month}` : ""}`} className="btn btn-ghost -my-1 text-xs">Wszystkie <ArrowRight className="size-3.5" /></Link>}>
          <div className="px-3 pb-4 sm:px-4">
            {recent.length ? <TransactionList txs={recent} /> : <p className="px-2 py-4 text-sm text-slate-500">Brak transakcji w tym miesiącu.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-2" title="Limity miesięczne"
          subtitle={m.budgetRows.length ? "Pionowa kreska = limit" : undefined}
          actions={<Link to="/ustawienia" className="btn btn-ghost -my-1 text-xs">Ustaw</Link>}>
          {m.budgetRows.length === 0
            ? <p className="text-sm text-slate-500 dark:text-slate-400">Ustaw limit dla kategorii (np. Spożywcze 2000 zł), a tutaj zobaczysz, ile z niego zostało.</p>
            : <ul className="space-y-3.5">
                {m.budgetRows.map((b) => {
                  const left = b.limit - b.spent;
                  return (
                    <li key={b.category.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2"><CategoryIcon icon={b.category.icon} color={b.category.color} size="sm" /><span className="truncate">{b.category.name}</span></span>
                        <span className="shrink-0 text-xs tnum text-slate-500 dark:text-slate-400">{moneyRound(b.spent)} / {moneyRound(b.limit)}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-white/5">
                        <div className={`h-2 rounded-full ${b.ratio > 1 ? "bg-red-500" : b.ratio > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, Math.max(2, b.ratio * 100))}%` }} />
                      </div>
                      <div className={`mt-1 text-xs ${left < 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                        {left < 0 ? `przekroczono o ${money(-left)}` : `zostało ${money(left)}`}
                      </div>
                    </li>
                  );
                })}
              </ul>}
        </Card>
      </div>
    </>
  );
}
