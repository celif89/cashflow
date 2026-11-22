import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { addMonths, thisMonth } from "../engine/dates";
import type { Transaction } from "../engine/types";
import { useData } from "../lib/DataContext";
import { dayLong, money, monthName, signedMoney } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { type MigrationKey, MIGRATIONS, migrationUrl } from "../lib/migrations";
import { cx, Notice } from "./ui";

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isNow = month === thisMonth();
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl bg-white/80 p-1 shadow-xs ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
      <button className="btn btn-ghost btn-icon" onClick={() => onChange(addMonths(month, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft className="size-4" /></button>
      <button className="min-w-36 px-2 text-center text-sm font-semibold capitalize" onClick={() => onChange(thisMonth())} title="Bieżący miesiąc">
        {monthName(month)}
      </button>
      <button className="btn btn-ghost btn-icon" disabled={isNow} onClick={() => onChange(addMonths(month, 1))} aria-label="Następny miesiąc"><ChevronRight className="size-4" /></button>
    </div>
  );
}

export function TransactionRow({ t }: { t: Transaction }) {
  const { categoryById, openEditor } = useData();
  const c = t.category_id !== null ? categoryById.get(t.category_id) : undefined;
  const title = t.merchant || c?.name || (t.kind === "income" ? "Przychód" : "Wydatek");
  const sub = [t.merchant ? c?.name ?? "bez kategorii" : null, t.note].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={() => openEditor({ id: t.id })}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03]">
      <CategoryIcon icon={c?.icon} color={c?.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span className="truncate">{title}</span>
          {t.receipt_id && <Receipt className="size-3.5 shrink-0 text-slate-400" aria-label="z paragonu" />}
        </div>
        {sub && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
      </div>
      <div className={cx("shrink-0 text-sm font-semibold tnum", t.kind === "income" && "text-emerald-600 dark:text-emerald-400")}>
        {signedMoney(t.amount, t.kind)}
      </div>
    </button>
  );
}

/** Lista transakcji pogrupowana po dniach, z sumą wydatków dnia. */
export function TransactionList({ txs }: { txs: Transaction[] }) {
  const days: { day: string; items: Transaction[] }[] = [];
  for (const t of txs) {
    const last = days[days.length - 1];
    if (last?.day === t.day) last.items.push(t);
    else days.push({ day: t.day, items: [t] });
  }
  return (
    <div className="space-y-4">
      {days.map(({ day, items }) => {
        const spent = items.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount, 0);
        return (
          <section key={day}>
            <div className="flex items-baseline justify-between px-2 pb-1">
              <h3 className="font-sans text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{dayLong(day)}</h3>
              {spent > 0 && <span className="text-xs text-slate-500 tnum dark:text-slate-400">{money(spent)}</span>}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {items.map((t) => <TransactionRow key={t.id} t={t} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Informacja, że dla tej funkcji trzeba uruchomić plik SQL w Supabase. */
export function MigrationNotice({ k }: { k: MigrationKey }) {
  const m = MIGRATIONS[k];
  return (
    <Notice tone="warn" action={<a href={migrationUrl(k)} target="_blank" rel="noreferrer" className="btn btn-secondary -my-1.5 py-1.5 text-xs">Otwórz plik SQL</a>}>
      <b>Jeszcze jeden krok w Supabase.</b> Funkcja „{m.what}” (wersja {m.version}) potrzebuje nowych tabel:
      otwórz plik <span className="font-mono text-xs">{m.file}</span>, skopiuj całość, w Supabase wejdź w <b>SQL Editor → New query</b>,
      wklej i kliknij <b>Run</b>. Potem odśwież tę stronę.
    </Notice>
  );
}
