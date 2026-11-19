import { FileUp, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MonthPicker, TransactionList } from "../components/finance";
import { Card, EmptyState, PageHeader, Segmented } from "../components/ui";
import { inMonth, totals, fold } from "../engine/stats";
import { useData } from "../lib/DataContext";
import { money, txCount } from "../lib/format";
import { useMonthParam } from "../lib/month";

type KindFilter = "all" | "expense" | "income";

export function TransactionsPage() {
  const { data, openEditor, categoryById } = useData();
  const [month, setMonth] = useMonthParam();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const cat = params.get("k"); // id kategorii albo "none"
  // wyszukiwanie przeszukuje wszystkie miesiące
  const searching = q.trim().length >= 2;

  const list = useMemo(() => {
    let txs = searching ? data!.transactions : inMonth(data!.transactions, month);
    if (kind !== "all") txs = txs.filter((t) => t.kind === kind);
    if (cat) txs = txs.filter((t) => (cat === "none" ? t.category_id === null : String(t.category_id) === cat));
    if (searching) {
      const f = fold(q);
      txs = txs.filter((t) => fold([t.merchant, t.note, t.category_id ? categoryById.get(t.category_id)?.name : "", String(t.amount).replace(".", ",")].join(" ")).includes(f));
    }
    return txs;
  }, [data, month, kind, cat, q, searching, categoryById]);

  const t = totals(list);
  const catName = cat === "none" ? "Bez kategorii" : cat ? categoryById.get(Number(cat))?.name : null;
  const clearCat = () => { const n = new URLSearchParams(params); n.delete("k"); setParams(n, { replace: true }); };

  return (
    <>
      <PageHeader eyebrow="Transakcje" title={searching ? "Wyniki wyszukiwania" : "Historia"}
        actions={<>
          {!searching && <MonthPicker month={month} onChange={setMonth} />}
          <Link to="/import" className="btn btn-secondary"><FileUp className="size-4" /> Import z banku
            {data!.pending.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{data!.pending.length}</span>}
          </Link>
          <button className="btn btn-primary hidden sm:inline-flex" onClick={() => openEditor()}><Plus className="size-4" /> Dodaj</button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Szukaj: sklep, notatka, kwota…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={kind} onChange={setKind}
          options={[{ value: "all", label: "Wszystkie" }, { value: "expense", label: "Wydatki" }, { value: "income", label: "Przychody" }]} />
        {catName && (
          <button className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" onClick={clearCat}>
            {catName} <X className="size-3.5" />
          </button>
        )}
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-100 px-5 py-3 text-sm dark:border-white/5">
          <span className="text-slate-500 dark:text-slate-400">{txCount(list.length)}</span>
          {t.expense > 0 && <span>Wydatki: <b className="tnum">{money(t.expense)}</b></span>}
          {t.income > 0 && <span>Przychody: <b className="tnum text-emerald-600 dark:text-emerald-400">{money(t.income)}</b></span>}
        </div>
        <div className="px-3 py-4 sm:px-4">
          {list.length
            ? <TransactionList txs={list} />
            : <EmptyState icon={<Search className="size-6" />} title="Nic tu nie ma">
                {searching ? "Żadna transakcja nie pasuje do wyszukiwania." : "W tym miesiącu nie ma transakcji spełniających filtr."}
              </EmptyState>}
        </div>
      </Card>
    </>
  );
}
