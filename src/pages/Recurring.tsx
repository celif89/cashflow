import { CalendarClock, Check, Pause, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, confirmAction, cx, EmptyState, Field, Modal, NumberInput, PageHeader, Segmented, useAction } from "../components/ui";
import { addMonths, daysInMonth, today } from "../engine/dates";
import { round2 } from "../engine/money";
import {
  dueDates, FREQUENCIES, frequencyLabel, installmentNo, type InstallmentStatus, installmentStatus, isScheduled, lastDue, monthlyCost, nextDue, ratesFromStart,
  type RecurringSuggestion, resetInstallments, staleDues, suggestRecurring,
} from "../engine/recurring";
import type { Kind, Recurring, Transaction } from "../engine/types";
import { deleteRecurring, deleteTransactions, insertRecurring, type RecurringInput, updateRecurring } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, moneyRound } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { MigrationNotice } from "../components/finance";

const pad = (n: number) => String(n).padStart(2, "0");

/** Następny miesiąc po ostatniej płatności, w typowym dniu (np. 15.). */
function nextFromSuggestion(s: RecurringSuggestion): string {
  const month = addMonths(s.lastDay.slice(0, 7), 1);
  return `${month}-${pad(Math.min(s.day, daysInMonth(month)))}`;
}

export function RecurringPage() {
  const { data, reload, categoryById } = useData();
  const { busy, run } = useAction(reload);
  const [edit, setEdit] = useState<Recurring | RecurringInput | null>(null);
  const list = data!.recurring;
  const notReady = data!.missing.includes("recurring");
  const now = today();
  const suggestions = useMemo(() => suggestRecurring(data!.transactions, list, now).slice(0, 6), [data, list, now]);
  // trwające: aktywne i z kolejnym terminem (spłacone raty i zakończone już się nie liczą)
  const running = (r: Recurring) => r.active && nextDue(r, now) !== null;
  const active = list.filter(running);
  const perMonth = (k: Kind) => active.filter((r) => r.kind === k).reduce((a, r) => a + monthlyCost(r), 0);
  const sorted = [...list].sort((a, b) => Number(running(b)) - Number(running(a)) || (nextDue(a, now) ?? "9").localeCompare(nextDue(b, now) ?? "9"));
  const allTx = useMemo(() => [...data!.transactions, ...data!.pending], [data]);
  const canInstallments = !data!.missing.includes("installments");

  const blank = (): RecurringInput => ({
    name: "", kind: "expense", amount: 0, variable_amount: false, category_id: null, merchant: null,
    // bez domyślnej daty: „dziś” od razu tworzyłoby płatność do sprawdzenia (np. 1. ratę kredytu, który rusza za miesiąc)
    every_months: 1, start_date: "", end_date: null, active: true,
  });

  return (
    <>
      <PageHeader eyebrow="Ustawienia" title="Stałe płatności"
        subtitle="Abonamenty, rachunki, podatki, wypłata. W dniu terminu płatność trafia do sprawdzenia – zatwierdzasz ją jednym kliknięciem."
        actions={notReady ? undefined : <button className="btn btn-primary" onClick={() => setEdit(blank())}><Plus className="size-4" /> Nowa</button>} />

      {notReady && <div className="mb-4"><MigrationNotice k="recurring" /></div>}

      {active.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-lg">
          <div className="card p-4"><div className="text-xs text-slate-500 dark:text-slate-400">Stałe wydatki / miesiąc</div><div className="font-display mt-1 text-2xl font-bold tnum">{moneyRound(perMonth("expense"))}</div></div>
          <div className="card p-4"><div className="text-xs text-slate-500 dark:text-slate-400">Stałe przychody / miesiąc</div><div className="font-display mt-1 text-2xl font-bold tnum">{moneyRound(perMonth("income"))}</div></div>
        </div>
      )}

      {!notReady && suggestions.length > 0 && (
        <Card className="mb-4" title="Wykryte w historii" icon={<Sparkles className="size-4" />}
          subtitle="Te płatności powtarzają się co miesiąc. Dodaj je, a kolejne same pojawią się do zatwierdzenia.">
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {suggestions.map((s) => {
              const c = s.category_id !== null ? categoryById.get(s.category_id) : undefined;
              return (
                <li key={s.merchantKey + s.kind} className="flex items-center gap-3 py-2.5">
                  <CategoryIcon icon={c?.icon} color={c?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {s.variable ? "ok. " : ""}{money(s.amount)} · ok. {s.day}. dnia · w {s.months} ostatnich miesiącach
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setEdit({
                    ...blank(), name: s.name, merchant: s.name, kind: s.kind, amount: round2(s.amount), variable_amount: s.variable,
                    category_id: s.category_id, start_date: nextFromSuggestion(s),
                  })}><Plus className="size-4" /> Dodaj</button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card pad={false}>
        <div className="px-3 py-3 sm:px-4">
          {list.length === 0
            ? <EmptyState icon={<CalendarClock className="size-6" />} title="Brak stałych płatności"
                action={notReady ? undefined : <button className="btn btn-primary" onClick={() => setEdit(blank())}><Plus className="size-4" /> Dodaj pierwszą</button>}>
                Np. Netflix co miesiąc 15., rachunek za prąd co 2 miesiące, podatek od nieruchomości co kwartał, wypłata 10. każdego miesiąca.
              </EmptyState>
            : <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {sorted.map((r) => {
                  const c = r.category_id !== null ? categoryById.get(r.category_id) : undefined;
                  const next = r.active ? nextDue(r, now) : null;
                  const st = installmentStatus(r, allTx, now);
                  return (
                    <li key={r.id}>
                      <button className={cx("flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03]", (!r.active || st?.done) && "opacity-60")}
                        onClick={() => setEdit(r)}>
                        <CategoryIcon icon={c?.icon} color={c?.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 truncate text-sm font-medium">
                            {r.name}
                            {!r.active && <Badge><Pause className="size-3" /> wstrzymana</Badge>}
                            {r.variable_amount && <Badge tone="amber">kwota zmienna</Badge>}
                            {st?.done && <Badge tone="green"><Check className="size-3" /> spłacone</Badge>}
                          </div>
                          {st ? <InstallmentLine st={st} next={next} /> : (
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {frequencyLabel(r)}{next ? ` · następna ${dayLabel(next)}` : r.active ? " · zakończona" : ""}
                            </div>
                          )}
                        </div>
                        <div className={cx("shrink-0 text-sm font-semibold tnum", r.kind === "income" && "text-emerald-600 dark:text-emerald-400")}>
                          {r.variable_amount ? "ok. " : ""}{r.kind === "income" ? "+" : "−"}{money(r.amount)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>}
        </div>
      </Card>

      {edit && (
        <RecurringModal value={edit} busy={busy} onClose={() => setEdit(null)} canInstallments={canInstallments}
          allTx={allTx}
          onDeleteTx={(t) => {
            if (!confirmAction(`Usunąć płatność z ${dayLabel(t.day)} (${money(t.amount)})? ${t.status === "pending" ? "Zniknie z „Do sprawdzenia”." : "Zniknie też z budżetu."}`)) return;
            void run(() => deleteTransactions([t.id]), "Usunięto płatność");
          }}
          onSave={async (input) => {
            const ok = await run(async () => {
              if (!("id" in edit)) return insertRecurring(input);
              await updateRecurring(edit.id, input);
              // czekające płatności, które po zmianie daty / liczby rat nie pasują do harmonogramu – znikają
              const stale = staleDues({ ...edit, ...input, id: edit.id }, data!.pending);
              if (stale.length) await deleteTransactions(stale.map((t) => t.id));
            }, "Zapisano stałą płatność");
            if (ok) setEdit(null);
          }}
          onDelete={"id" in edit ? async () => {
            if (!confirmAction(`Usunąć „${edit.name}”? Zatwierdzone płatności zostaną w historii, czekające znikną.`)) return;
            const ok = await run(() => deleteRecurring(edit.id), "Usunięto");
            if (ok) setEdit(null);
          } : undefined} />
      )}
    </>
  );
}

/** „spłacono 8 z 10 · zostało 300 zł · ostatnia 05.01.2027” + pasek postępu */
function InstallmentLine({ st, next }: { st: InstallmentStatus; next: string | null }) {
  return (
    <div className="mt-0.5">
      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
        {st.done
          ? `spłacono wszystkie ${st.total} rat`
          : <>spłacono <b className="text-slate-700 dark:text-slate-200">{st.paid} z {st.total}</b> rat · zostało {money(st.remainingAmount)}
              {next ? ` · następna ${dayLabel(next)}` : ""}{st.last && st.last !== next ? ` · ostatnia ${dayLabel(st.last)}` : ""}
              {st.pending ? ` · ${st.pending} czeka na zatwierdzenie` : ""}
              {st.ahead ? ` · ${st.ahead} zapisana z góry` : ""}</>}
      </div>
      <div className="mt-1 h-1.5 max-w-xs rounded-full bg-slate-100 dark:bg-white/5">
        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (st.paid / st.total) * 100)}%` }} />
      </div>
    </div>
  );
}

function RecurringModal({ value, allTx, canInstallments, busy, onClose, onSave, onDelete, onDeleteTx }: {
  value: Recurring | RecurringInput; allTx: Transaction[]; canInstallments: boolean; busy: boolean;
  onClose: () => void; onSave: (r: RecurringInput) => void; onDelete?: () => void; onDeleteTx?: (t: Transaction) => void;
}) {
  const { activeCategories, categoryById } = useData();
  const [v, setV] = useState<RecurringInput>(() => {
    const { id: _id, ...rest } = value as Recurring;
    return rest;
  });
  const set = (p: Partial<RecurringInput>) => setV((x) => ({ ...x, ...p }));
  const cats = activeCategories(v.kind);
  const current = v.category_id !== null ? categoryById.get(v.category_id) : undefined;
  const choices = current && !cats.includes(current) ? [...cats, current] : cats;
  const now = today();
  const isNew = !("id" in value);
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(v.start_date);

  // raty: liczba wszystkich i ile spłacono
  const [rates, setRates] = useState(!!value.installments_total);
  const [total, setTotal] = useState<number | null>(value.installments_total ?? null);
  // przy edycji: stan spłaty według ustawień z okna (data, liczba rat) – przelicza się, gdy je zmieniasz
  const live = !isNew && rates && total && hasDate
    ? installmentStatus({ ...(value as Recurring), ...v, installments_total: total, installments_paid_before: value.installments_paid_before ?? 0 }, allTx, now)
    : null;
  // „spłacono”: przy nowej – to, co wpiszesz; przy edycji – stan obecny, dopóki go sam nie zmienisz
  const [paidInput, setPaidInput] = useState<number | null | undefined>(isNew ? value.installments_paid_before ?? 0 : undefined);
  const paid = paidInput === undefined ? live?.paid ?? value.installments_paid_before ?? 0 : paidInput;
  const paidChanged = !isNew && paidInput !== undefined && live !== null && paid !== live.paid;

  // nowa pozycja z datą dziś albo w przeszłości: te terminy od razu trafią do sprawdzenia
  const due = (to: string) => dueDates({ ...v, installments_total: rates ? total : null, installments_paid_before: paid ?? 0 }, v.start_date, to);
  const past = isNew && hasDate && v.start_date < now ? due(now).slice(-12).length : 0;
  const dueToday = isNew && hasDate && v.start_date === now;
  const ratesOk = !rates || (canInstallments && total !== null && total >= 1 && paid !== null && paid >= 0 && paid <= total);
  const valid = v.name.trim() && v.amount > 0 && hasDate && (!v.end_date || v.end_date >= v.start_date) && ratesOk;

  /** harmonogram po zapisie (do podglądu i do zapisu) */
  function withRates(): RecurringInput {
    const base: RecurringInput = { ...v, name: v.name.trim(), merchant: v.merchant?.trim() || null, amount: round2(v.amount) };
    if (!canInstallments) {
      // kolumn jeszcze nie ma w bazie – nie wysyłamy ich wcale
      const { installments_total: _t, installments_paid_before: _p, ...rest } = base;
      return rest;
    }
    if (!rates || total === null) return { ...base, installments_total: null, installments_paid_before: 0 };
    const p = Math.min(paid ?? 0, total);
    // edycja ze zmienioną liczbą spłaconych rat → harmonogram od następnego terminu po dziś
    if (paidChanged && hasDate) return { ...base, end_date: null, installments_total: total, ...resetInstallments({ ...(value as Recurring), ...base, installments_total: total }, p, now) };
    return { ...base, end_date: null, installments_total: total, installments_paid_before: isNew ? p : value.installments_paid_before ?? 0 };
  }
  const preview = withRates();
  // ile rat zostało: wszystkie − spłacone (wpisane razem z zatwierdzonymi w aplikacji)
  const left = rates && total !== null && paid !== null ? Math.max(0, total - Math.min(paid, total)) : ratesFromStart(preview);

  return (
    <Modal open onClose={onClose} title={isNew ? "Nowa stała płatność" : "Stała płatność"}
      footer={<>
        {onDelete && <button className="btn btn-danger mr-auto" onClick={onDelete}><Trash2 className="size-4" /> Usuń</button>}
        <button className="btn btn-secondary" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary" disabled={!valid || busy}
          onClick={() => onSave(withRates())}>Zapisz</button>
      </>}>
      <div className="space-y-4">
        <Segmented value={v.kind} onChange={(k) => set({ kind: k, category_id: null })}
          options={[{ value: "expense", label: "Wydatek" }, { value: "income", label: "Przychód" }]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nazwa"><input className="input" value={v.name} autoFocus={isNew} placeholder={v.kind === "expense" ? "np. Netflix, Prąd, Podatek" : "np. Wypłata"} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={v.variable_amount ? "Kwota orientacyjna" : "Kwota"}>
            <NumberInput value={v.amount || null} onChange={(a) => set({ amount: a ?? 0 })} suffix="zł" />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={v.variable_amount} onChange={(e) => set({ variable_amount: e.target.checked })} />
          <span>Kwota zmienna (prąd, woda, gaz) – właściwą wpiszę przy zatwierdzeniu</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategoria">
            <select className="input" value={v.category_id ?? ""} onChange={(e) => set({ category_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— wybierz —</option>
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={v.kind === "expense" ? "Odbiorca (opcjonalnie)" : "Od kogo (opcjonalnie)"} hint="Pomaga połączyć płatność z pozycją z wyciągu">
            <input className="input" value={v.merchant ?? ""} placeholder={v.name || "jak nazwa"} onChange={(e) => set({ merchant: e.target.value })} />
          </Field>
        </div>
        {v.kind === "expense" && (
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/[0.03]">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={rates} onChange={(e) => setRates(e.target.checked)} />
              <span>Spłata w ratach (kredyt, zakup na raty) – po ostatniej racie płatność sama się skończy</span>
            </label>
            {rates && !canInstallments && <div className="mt-3"><MigrationNotice k="installments" /></div>}
            {rates && canInstallments && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
                <Field label="Liczba rat">
                  <input className="input" type="number" inputMode="numeric" min={1} max={600} value={total ?? ""} placeholder="np. 10"
                    onChange={(e) => setTotal(e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value))))} />
                </Field>
                <Field label={isNew ? "Już spłacono" : "Spłacono rat"} hint={isNew ? "0 = pierwsza rata jeszcze przed Tobą" : undefined}>
                  <input className="input" type="number" inputMode="numeric" min={0} max={total ?? 600} value={paid ?? ""} placeholder="0"
                    onChange={(e) => setPaidInput(e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))} />
                </Field>
              </div>
            )}
            {rates && canInstallments && total !== null && paid !== null && paid > total && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">Spłaconych rat nie może być więcej niż wszystkich.</p>
            )}
          </div>
        )}
        <div className={cx("grid gap-4", rates ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          <Field label="Jak często">
            <select className="input" value={v.every_months} onChange={(e) => set({ every_months: Number(e.target.value) })}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label={rates ? `Termin ${(preview.installments_paid_before ?? paid ?? 0) + 1}. raty` : isNew ? "Najbliższa płatność" : "Pierwsza płatność"}>
            <input className="input" type="date" value={paidChanged ? preview.start_date : v.start_date} required
              disabled={paidChanged} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          {!rates && (
            <Field label="Do kiedy" hint="Puste = bez końca">
              <input className="input" type="date" value={v.end_date ?? ""} min={v.start_date} onChange={(e) => set({ end_date: e.target.value || null })} />
            </Field>
          )}
        </div>
        {rates && canInstallments && hasDate && total !== null && paid !== null && paid <= total && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {left === 0
              ? "Wszystkie raty spłacone – płatność nie będzie się już pojawiać."
              : <>Zostało {left} {left === 1 ? "rata" : left % 10 >= 2 && left % 10 <= 4 && (left % 100 < 12 || left % 100 > 14) ? "raty" : "rat"} ({money(left * round2(v.amount || 0))}),
                  ostatnia {lastDue(preview) ? dayLabel(lastDue(preview)!) : "–"}. Potem płatność sama się wygasi.</>}
          </p>
        )}
        {/^\d{4}-\d{2}-\d{2}$/.test(v.start_date) && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <CalendarClock className="mr-1 inline size-4 align-[-3px]" />
            {frequencyLabel(v)}. Kolejne terminy: {dueDates(preview, now, "2100-12-31", 60).slice(0, 3).map(dayLabel).join(", ") || "brak"}.
          </p>
        )}
        {dueToday && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            Termin jest dziś – {rates ? `${(paid ?? 0) + 1}. rata` : "ta płatność"} od razu trafi do „Do sprawdzenia”. Jeśli pierwsza płatność będzie później, wybierz jej datę.
          </p>
        )}
        {past > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            Data jest w przeszłości: {past === 1 ? "1 zaległa płatność trafi" : `${past} zaległe płatności trafią`} do sprawdzenia. Jeśli są już w budżecie (np. z wyciągu), aplikacja zaproponuje połączenie.
          </p>
        )}
        {!isNew && <PaymentsList r={{ ...(value as Recurring), ...preview }} allTx={allTx} busy={busy} onDeleteTx={onDeleteTx} />}
        {!isNew && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-600" checked={!v.active} onChange={(e) => set({ active: !e.target.checked })} />
            Wstrzymaj (nowe płatności nie będą się pojawiać)
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Płatności powiązane ze stałą pozycją: która liczy się jako rata, która czeka, która jest spoza harmonogramu. */
function PaymentsList({ r, allTx, busy, onDeleteTx }: { r: Recurring; allTx: Transaction[]; busy: boolean; onDeleteTx?: (t: Transaction) => void }) {
  const list = allTx.filter((t) => t.recurring_id === r.id).sort((a, b) => (b.recurring_due ?? b.day).localeCompare(a.recurring_due ?? a.day));
  if (!list.length) return <p className="text-xs text-slate-500 dark:text-slate-400">Płatności z tej pozycji: jeszcze żadnej.</p>;
  return (
    <div>
      <span className="label">Płatności z tej pozycji</span>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm dark:divide-white/5 dark:border-white/10">
        {list.slice(0, 24).map((t) => {
          const due = t.recurring_due ?? t.day;
          const inPlan = isScheduled(r, due);
          const no = inPlan ? installmentNo(r, due) : null;
          return (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-20 shrink-0 text-xs text-slate-500 tnum dark:text-slate-400">{dayLabel(due)}</span>
              <span className="min-w-0 flex-1 truncate text-xs">
                {no ? `rata ${no} z ${r.installments_total}` : inPlan ? "płatność" : <span className="font-medium text-amber-700 dark:text-amber-300">spoza harmonogramu – nie liczy się jako rata</span>}
                {t.status === "pending" && <span className="ml-1 text-amber-700 dark:text-amber-300">· czeka na zatwierdzenie</span>}
                {t.status !== "pending" && due > today() && <span className="ml-1 text-amber-700 dark:text-amber-300">· zapisana z góry (termin jeszcze nie nadszedł)</span>}
                {t.day !== due && <span className="ml-1 text-slate-400">· data wpisu {dayLabel(t.day)}</span>}
              </span>
              <span className="shrink-0 font-semibold tnum">{money(t.amount)}</span>
              {onDeleteTx && (
                <button type="button" className="btn btn-ghost btn-icon size-7 text-slate-400" disabled={busy} aria-label="Usuń płatność" title="Usuń płatność"
                  onClick={() => onDeleteTx(t)}><Trash2 className="size-3.5" /></button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
