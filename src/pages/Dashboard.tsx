import { ArrowRight, CalendarClock, FileUp, Plus, ScanLine, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Donut, Lines, RankBars, usePalette } from "../components/charts";
import { MonthPicker, TransactionList } from "../components/finance";
import { Card, EmptyState, Notice, PageHeader, Segmented, Stat } from "../components/ui";
import { addMonths, daysInMonth, parseDay, thisMonth, toDay, today } from "../engine/dates";
import { CATEGORY_COLORS } from "../engine/defaults";
import { installmentNo, plannedCumulative, upcoming } from "../engine/recurring";
import { budgets, byCategory, cumulative, donutSlices, forecast, inMonth, totals } from "../engine/stats";
import { useData } from "../lib/DataContext";
import { axisMoney, dayLabel, money, moneyRound, monthName, percent, plural, txCount } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { useMonthParam } from "../lib/month";

type CatView = "donut" | "list";
const VIEW_KEY = "cf.catView";
const storedView = (): CatView => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "donut"; } catch { return "donut"; } };

export function Dashboard() {
  const { data, openEditor } = useData();
  const [month, setMonth] = useMonthParam();
  const navigate = useNavigate();
  const p = usePalette();
  const [view, setViewState] = useState<CatView>(storedView);
  const setView = (v: CatView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* tryb prywatny */ } };
  const txs = data!.transactions;
  const categories = data!.categories;
  const prev = addMonths(month, -1);
  const isNow = month === thisMonth();
  const isFuture = month > thisMonth();
  const upto = isNow ? Number(today().slice(8, 10)) : daysInMonth(month);

  const m = useMemo(() => {
    const cur = inMonth(txs, month);
    const before = inMonth(txs, prev);
    const t = totals(cur), tp = totals(before);
    // porównanie z poprzednim miesiącem „do tego samego dnia”, żeby 10 listopada nie zestawiać z całym październikiem
    const prevSameDay = totals(before.filter((x) => Number(x.day.slice(8, 10)) <= upto)).expense;
    const cats = byCategory(cur, categories);
    return {
      cur, t, tp, prevSameDay, cats,
      slices: donutSlices(cats, CATEGORY_COLORS.slice(0, 8)),
      budgetRows: budgets(cur, categories),
      line: cumulative(txs, month, prev, upto),
      fc: isNow ? forecast(t.expense, month, upto) : null,
    };
  }, [txs, categories, month, prev, upto, isNow]);

  const pendingCount = data!.pending.length;
  // najbliższe stałe płatności (30 dni) i ile z nich przypada jeszcze w tym miesiącu
  const now = today();
  const soon = useMemo(() => {
    const until = new Date(parseDay(now)); until.setDate(until.getDate() + 30);
    return upcoming(data!.recurring, now, toDay(until));
  }, [data, now]);
  // plan ze stałych płatności: przy bieżącym miesiącu – na przyszły, przy przyszłym – na ten wybrany
  const next = addMonths(thisMonth(), 1);
  const planMonth = isNow ? next : isFuture ? month : null;
  const planned = useMemo(() => (planMonth ? plannedCumulative(data!.recurring, planMonth) : null), [data, planMonth]);
  const showPlan = !!planned && planned.total > 0;
  // stałe płatności w wybranym przyszłym miesiącu (z numerami rat)
  const monthDues = useMemo(() => (isFuture ? upcoming(data!.recurring, `${prev}-${daysInMonth(prev)}`, `${month}-${daysInMonth(month)}`) : []), [data, isFuture, month, prev]);
  const lineData = useMemo(() => {
    if (!showPlan) return m.line;
    const len = Math.max(m.line.length, planned!.byDay.length);
    return Array.from({ length: len }, (_, i) => ({
      ...(m.line[i] ?? { day: i + 1, current: null, previous: null }),
      planned: planned!.byDay[i] ?? null,
    }));
  }, [m.line, planned, showPlan]);
  const leftThisMonth = soon.filter((u) => u.r.kind === "expense" && u.due.slice(0, 7) === thisMonth()).reduce((a, u) => a + u.r.amount, 0);
  const openCategory = (key: string) => key === "rest"
    ? navigate("/raporty")
    : navigate(`/transakcje?${new URLSearchParams({ ...(month !== thisMonth() ? { m: month } : {}), k: key })}`);
  const pendingBanner = pendingCount > 0 && (
    <div className="mb-4">
      <Notice tone="warn" action={<Link to="/do-sprawdzenia" className="btn btn-secondary -my-1.5 py-1.5 text-xs">Sprawdź</Link>}>
        Do sprawdzenia: {plural(pendingCount, "pozycja", "pozycje", "pozycji")}. Dopóki ich nie zatwierdzisz, nie liczą się do budżetu.
      </Notice>
    </div>
  );

  if (txs.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Budżet domowy" title="Witaj w Cashflow" subtitle="Zacznij od pierwszego wydatku, zeskanuj paragon albo wczytaj wyciąg z banku." />
        {pendingBanner}
        <Card>
          <EmptyState icon={<Wallet className="size-7" />} title="Nie ma jeszcze żadnych transakcji"
            action={<div className="flex flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={() => openEditor()}><Plus className="size-4" /> Dodaj wydatek</button>
              <Link className="btn btn-secondary" to="/skanuj"><ScanLine className="size-4" /> Skanuj paragon</Link>
              <Link className="btn btn-secondary" to="/import"><FileUp className="size-4" /> Wczytaj wyciąg</Link>
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
      {pendingBanner}
      {isFuture && (
        <div className="mb-4">
          <Notice tone="info" action={<button className="btn btn-secondary -my-1.5 py-1.5 text-xs" onClick={() => setMonth(thisMonth())}>Bieżący miesiąc</button>}>
            To przyszły miesiąc: widać zaplanowane stałe płatności{m.cur.length ? " i wpisy z datą w przyszłości" : ""}.
            Płatności trafią do „Do sprawdzenia” w dniu terminu.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Wydatki" icon={<TrendingDown className="size-4" />} value={moneyRound(m.t.expense)}
          hint={isFuture
            ? (m.cur.length ? txCount(m.cur.filter((x) => x.kind === "expense").length) + " z datą w przyszłości" : "miesiąc jeszcze się nie zaczął")
            : m.prevSameDay > 0
            ? <span className={diff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                {diff > 0 ? "▲" : "▼"} {moneyRound(Math.abs(diff))} {isNow ? "vs ten sam okres w poprz. miesiącu" : "vs poprzedni miesiąc"}
              </span>
            : txCount(m.cur.filter((x) => x.kind === "expense").length)} />
        <Stat label="Przychody" icon={<TrendingUp className="size-4" />} value={moneyRound(m.t.income)}
          hint={m.t.income === 0 ? <button className="underline" onClick={() => openEditor({ kind: "income", day: isNow ? today() : `${month}-01` })}>dodaj przychód</button> : undefined} />
        <Stat label="Saldo" icon={<Wallet className="size-4" />} value={`${m.t.balance < 0 ? "−" : ""}${moneyRound(Math.abs(m.t.balance))}`}
          tone={m.t.balance < 0 ? "warn" : "good"}
          hint={m.t.income > 0 ? `wydano ${percent(m.t.expense / m.t.income)} przychodów` : undefined} />
        {isFuture
          ? <Stat label="Zaplanowane stałe płatności" icon={<CalendarClock className="size-4" />} value={moneyRound(planned?.total ?? 0)}
              hint={planned?.count ? plural(planned.count, "płatność", "płatności", "płatności") : "brak w tym miesiącu"} />
          : m.fc !== null
          ? <Stat label="Prognoza na koniec miesiąca" value={moneyRound(m.fc)} hint={`przy obecnym tempie · ${moneyRound(m.t.expense / upto)} dziennie`} />
          : <Stat label="Średnio dziennie" value={moneyRound(m.t.expense / Math.max(upto, 1))} hint={`poprzedni miesiąc: ${moneyRound(m.tp.expense)}`} />}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Wydatki narastająco"
          subtitle={showPlan
            ? `${monthName(month)} na tle ${monthName(prev)} · ${monthName(planMonth!)}: stałe płatności ${moneyRound(planned!.total)} (${plural(planned!.count, "płatność", "płatności", "płatności")})`
            : `${monthName(month)} na tle ${monthName(prev)}`}>
          <Lines data={lineData} x="day" height={300} fmt={money} axisFmt={axisMoney} labelFmt={(d) => `${d}. dzień`}
            series={[
              // w przyszłym miesiącu linia „wydatków” tylko wtedy, gdy są wpisy z datą w przyszłości
              ...(isFuture && m.cur.length === 0 ? [] : [{ key: "current", name: monthName(month), color: p.s1 }]),
              { key: "previous", name: monthName(prev), color: p.muted, dashed: true },
              ...(showPlan ? [{ key: "planned", name: `${monthName(planMonth!)} – plan (stałe)`, color: p.s2, dashed: "2 4" }] : []),
            ]} />
          {showPlan && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Kropkowana linia: stałe płatności zaplanowane na {monthName(planMonth!)}, bez codziennych zakupów
              {planned!.variable ? "; rachunki o zmiennej kwocie liczone orientacyjnie" : ""}.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Na co idą pieniądze" subtitle="Kliknij kategorię, żeby zobaczyć transakcje"
          actions={m.cats.length > 0 ? <Segmented value={view} onChange={setView} options={[{ value: "donut", label: "Wykres" }, { value: "list", label: "Lista" }]} /> : undefined}>
          {m.cats.length === 0
            ? <p className="text-sm text-slate-500">Brak wydatków w tym miesiącu.</p>
            : view === "donut"
              ? <Donut total={m.t.expense} fmt={moneyRound} onPick={openCategory} centerLabel="wydatki"
                  slices={m.slices.map((s) => ({ ...s, hint: s.others ? `(${s.others})` : undefined }))} />
              : <>
                  <RankBars fmt={moneyRound} onPick={openCategory}
                    rows={m.cats.slice(0, 8).map((r) => ({
                      key: String(r.category?.id ?? "none"),
                      label: <><CategoryIcon icon={r.category?.icon} color={r.category?.color} size="sm" /><span className="truncate">{r.category?.name ?? "Bez kategorii"}</span></>,
                      value: r.amount,
                      hint: percent(r.share),
                      limit: r.category?.monthly_limit,
                    }))} />
                  {m.cats.length > 8 && <p className="mt-3 text-xs text-slate-500">+ {m.cats.length - 8} pozostałych kategorii w Raportach</p>}
                </>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Ostatnie transakcje" pad={false}
          actions={<Link to={`/transakcje${month !== thisMonth() ? `?m=${month}` : ""}`} className="btn btn-ghost -my-1 text-xs">Wszystkie <ArrowRight className="size-3.5" /></Link>}>
          <div className="px-3 pb-4 sm:px-4">
            {recent.length ? <TransactionList txs={recent} /> : <p className="px-2 py-4 text-sm text-slate-500">Brak transakcji w tym miesiącu.</p>}
          </div>
        </Card>

        <div className="min-w-0 space-y-4 lg:col-span-2">
        <Card title={isFuture ? `Stałe płatności – ${monthName(month)}` : "Najbliższe stałe płatności"} icon={<CalendarClock className="size-4" />}
          subtitle={isFuture ? (monthDues.length ? `razem ${moneyRound(monthDues.filter((u) => u.r.kind === "expense").reduce((a, u) => a + u.r.amount, 0))} wydatków` : undefined)
            : soon.length && leftThisMonth > 0 ? `do końca miesiąca jeszcze ${moneyRound(leftThisMonth)}` : "30 dni"}
          actions={<Link to="/stale-platnosci" className="btn btn-ghost -my-1 text-xs">{data!.recurring.length ? "Zarządzaj" : "Dodaj"}</Link>}>
          {(isFuture ? monthDues : soon).length === 0
            ? <p className="text-sm text-slate-500 dark:text-slate-400">
                {data!.recurring.length ? (isFuture ? "W tym miesiącu nie ma stałych płatności." : "W najbliższych 30 dniach nie ma stałych płatności.") : "Dodaj abonamenty, rachunki i podatki – w dniu terminu pojawią się do zatwierdzenia, a tutaj zobaczysz, co jeszcze przed Tobą."}
              </p>
            : <ul className="space-y-2">
                {(isFuture ? monthDues : soon).slice(0, isFuture ? 20 : 6).map(({ r, due }) => {
                  const c = r.category_id !== null ? data!.categories.find((x) => x.id === r.category_id) : undefined;
                  return (
                    <li key={`${r.id}-${due}`} className="flex items-center gap-2.5 text-sm">
                      <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{r.name}
                        {installmentNo(r, due) && <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">rata {installmentNo(r, due)}/{r.installments_total}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 tnum dark:text-slate-400">{dayLabel(due).slice(0, 5)}</span>
                      <span className={`w-24 shrink-0 text-right font-semibold tnum ${r.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {r.variable_amount ? "≈ " : ""}{r.kind === "income" ? "+" : "−"}{moneyRound(r.amount)}
                      </span>
                    </li>
                  );
                })}
                {!isFuture && soon.length > 6 && <li className="text-xs text-slate-500">+ {soon.length - 6} kolejnych</li>}
              </ul>}
        </Card>

        <Card title="Limity miesięczne"
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
      </div>
    </>
  );
}
