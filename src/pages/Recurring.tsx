import { CalendarClock, Pause, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, confirmAction, cx, EmptyState, Field, Modal, NumberInput, PageHeader, Segmented, useAction } from "../components/ui";
import { addMonths, daysInMonth, today } from "../engine/dates";
import { round2 } from "../engine/money";
import { dueDates, FREQUENCIES, frequencyLabel, monthlyCost, nextDue, type RecurringSuggestion, suggestRecurring } from "../engine/recurring";
import type { Kind, Recurring } from "../engine/types";
import { deleteRecurring, insertRecurring, type RecurringInput, updateRecurring } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, moneyRound } from "../lib/format";
import { CategoryIcon } from "../lib/icons";

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
  const now = today();
  const suggestions = useMemo(() => suggestRecurring(data!.transactions, list, now).slice(0, 6), [data, list, now]);
  const active = list.filter((r) => r.active && (!r.end_date || r.end_date >= now));
  const perMonth = (k: Kind) => active.filter((r) => r.kind === k).reduce((a, r) => a + monthlyCost(r), 0);
  const sorted = [...list].sort((a, b) => Number(b.active) - Number(a.active) || (nextDue(a, now) ?? "9").localeCompare(nextDue(b, now) ?? "9"));

  const blank = (): RecurringInput => ({
    name: "", kind: "expense", amount: 0, variable_amount: false, category_id: null, merchant: null,
    every_months: 1, start_date: now, end_date: null, active: true,
  });

  return (
    <>
      <PageHeader eyebrow="Ustawienia" title="Stałe płatności"
        subtitle="Abonamenty, rachunki, podatki, wypłata. W dniu terminu płatność trafia do sprawdzenia – zatwierdzasz ją jednym kliknięciem."
        actions={<button className="btn btn-primary" onClick={() => setEdit(blank())}><Plus className="size-4" /> Nowa</button>} />

      {active.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-lg">
          <div className="card p-4"><div className="text-xs text-slate-500 dark:text-slate-400">Stałe wydatki / miesiąc</div><div className="font-display mt-1 text-2xl font-bold tnum">{moneyRound(perMonth("expense"))}</div></div>
          <div className="card p-4"><div className="text-xs text-slate-500 dark:text-slate-400">Stałe przychody / miesiąc</div><div className="font-display mt-1 text-2xl font-bold tnum">{moneyRound(perMonth("income"))}</div></div>
        </div>
      )}

      {suggestions.length > 0 && (
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
                action={<button className="btn btn-primary" onClick={() => setEdit(blank())}><Plus className="size-4" /> Dodaj pierwszą</button>}>
                Np. Netflix co miesiąc 15., rachunek za prąd co 2 miesiące, podatek od nieruchomości co kwartał, wypłata 10. każdego miesiąca.
              </EmptyState>
            : <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {sorted.map((r) => {
                  const c = r.category_id !== null ? categoryById.get(r.category_id) : undefined;
                  const next = r.active ? nextDue(r, now) : null;
                  return (
                    <li key={r.id}>
                      <button className={cx("flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03]", !r.active && "opacity-60")}
                        onClick={() => setEdit(r)}>
                        <CategoryIcon icon={c?.icon} color={c?.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 truncate text-sm font-medium">
                            {r.name}
                            {!r.active && <Badge><Pause className="size-3" /> wstrzymana</Badge>}
                            {r.variable_amount && <Badge tone="amber">kwota zmienna</Badge>}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {frequencyLabel(r)}{next ? ` · następna ${dayLabel(next)}` : r.active ? " · zakończona" : ""}
                          </div>
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
        <RecurringModal value={edit} busy={busy} onClose={() => setEdit(null)}
          onSave={async (input) => {
            const ok = await run(() => ("id" in edit ? updateRecurring(edit.id, input) : insertRecurring(input)), "Zapisano stałą płatność");
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

function RecurringModal({ value, busy, onClose, onSave, onDelete }: {
  value: Recurring | RecurringInput; busy: boolean; onClose: () => void; onSave: (r: RecurringInput) => void; onDelete?: () => void;
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
  // nowa pozycja z datą w przeszłości: zaległe terminy trafią do sprawdzenia
  const past = isNew && v.start_date < now ? dueDates(v, v.start_date, now).slice(-12).length : 0;
  const valid = v.name.trim() && v.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(v.start_date) && (!v.end_date || v.end_date >= v.start_date);

  return (
    <Modal open onClose={onClose} title={isNew ? "Nowa stała płatność" : "Stała płatność"}
      footer={<>
        {onDelete && <button className="btn btn-danger mr-auto" onClick={onDelete}><Trash2 className="size-4" /> Usuń</button>}
        <button className="btn btn-secondary" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary" disabled={!valid || busy}
          onClick={() => onSave({ ...v, name: v.name.trim(), merchant: v.merchant?.trim() || null, amount: round2(v.amount) })}>Zapisz</button>
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jak często">
            <select className="input" value={v.every_months} onChange={(e) => set({ every_months: Number(e.target.value) })}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label={isNew ? "Najbliższa płatność" : "Pierwsza płatność"}>
            <input className="input" type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="Do kiedy" hint="Puste = bez końca">
            <input className="input" type="date" value={v.end_date ?? ""} min={v.start_date} onChange={(e) => set({ end_date: e.target.value || null })} />
          </Field>
        </div>
        {/^\d{4}-\d{2}-\d{2}$/.test(v.start_date) && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <CalendarClock className="mr-1 inline size-4 align-[-3px]" />
            {frequencyLabel(v)}. Kolejne terminy: {dueDates(v, now, "2100-12-31", 60).slice(0, 3).map(dayLabel).join(", ") || "brak"}.
          </p>
        )}
        {past > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            Data jest w przeszłości: {past === 1 ? "1 zaległa płatność trafi" : `${past} zaległe płatności trafią`} do sprawdzenia. Jeśli są już w budżecie (np. z wyciągu), aplikacja zaproponuje połączenie.
          </p>
        )}
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
