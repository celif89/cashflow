import { ArrowLeftRight, CalendarClock, Check, CheckCheck, FileUp, History, Link2, SkipForward, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, cx, EmptyState, NumberInput, PageHeader, Segmented, useAction } from "../components/ui";
import { type Match, matchExisting, ownTransferReason } from "../engine/bank";
import { round2 } from "../engine/money";
import { frequencyLabel, installmentNo, matchRecurring } from "../engine/recurring";
import type { NewTransaction, Recurring, Transaction } from "../engine/types";
import { confirmPending, mergePending, mergeRecurring, skipPending } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, plural, signedMoney } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { isConfident } from "../lib/importer";

type Filter = "all" | "bank" | "recurring";
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

export function ReviewPage() {
  const { data, reload } = useData();
  const { busy, run } = useAction(reload);
  const [filter, setFilter] = useState<Filter>("all");
  const pending = data!.pending;
  const recById = useMemo(() => new Map(data!.recurring.map((r) => [r.id, r])), [data]);

  // pozycje z banku ↔ paragony i ręczne wpisy; stałe płatności ↔ to samo z wyciągu
  const bankMatches = useMemo(() => matchExisting(pending.filter((t) => t.bank_ref), data!.receipts, data!.transactions), [pending, data]);
  const recMatches = useMemo(() => matchRecurring(pending.filter((t) => t.recurring_id), [...data!.transactions, ...pending], data!.recurring), [pending, data]);
  const matched = (t: Transaction) => bankMatches.has(t.id) || recMatches.has(t.id);
  const confident = pending.filter((t) => isConfident(t, matched(t), t.recurring_id ? recById.get(t.recurring_id)?.variable_amount : false));

  const hasBoth = pending.some((t) => t.bank_ref) && pending.some((t) => t.recurring_id);
  const shown = pending.filter((t) => filter === "all" || (filter === "bank" ? !!t.bank_ref : !!t.recurring_id));

  return (
    <>
      <PageHeader eyebrow="Transakcje" title="Do sprawdzenia"
        subtitle="Pozycje z wyciągu i stałe płatności. Dopóki ich nie zatwierdzisz, nie liczą się do budżetu."
        actions={<Link to="/import" className="btn btn-secondary"><FileUp className="size-4" /> Wczytaj wyciąg</Link>} />

      <Card pad={false}
        title={plural(pending.length, "pozycja", "pozycje", "pozycji")}
        subtitle={pending.length ? "Zatwierdź, popraw albo pomiń każdą pozycję." : undefined}
        actions={confident.length > 0 ? (
          <button className="btn btn-secondary" disabled={busy}
            title="Kategoria z Twojej historii albo stała płatność o stałej kwocie; bez podejrzenia duplikatu i przelewu własnego"
            onClick={() => void run(() => confirmPending(confident.map((t) => ({ t }))), `Zatwierdzono ${confident.length} pozycji`)}>
            <CheckCheck className="size-4" /> Zatwierdź pewne ({confident.length})
          </button>
        ) : undefined}>
        <div className="px-3 pb-4 sm:px-4">
          {hasBoth && (
            <div className="mb-3">
              <Segmented value={filter} onChange={setFilter}
                options={[{ value: "all", label: "Wszystkie" }, { value: "bank", label: "Z wyciągu" }, { value: "recurring", label: "Stałe płatności" }]} />
            </div>
          )}
          {pending.length === 0
            ? <EmptyState icon={<CheckCheck className="size-6" />} title="Wszystko sprawdzone">
                Tutaj trafiają pozycje z wczytanego wyciągu i stałe płatności w dniu, w którym przypada ich termin.
              </EmptyState>
            : <ul className="space-y-3">
                {shown.map((t) => (
                  <PendingRow key={t.id} t={t} busy={busy} run={run}
                    match={bankMatches.get(t.id)} recMatch={recMatches.get(t.id)}
                    recurring={t.recurring_id ? recById.get(t.recurring_id) : undefined} />
                ))}
              </ul>}
        </div>
      </Card>
    </>
  );
}

function PendingRow({ t, match, recMatch, recurring, busy, run }: {
  t: Transaction; match?: Match; recMatch?: Transaction; recurring?: Recurring; busy: boolean; run: Run;
}) {
  const { activeCategories, categoryById } = useData();
  const [categoryId, setCategoryId] = useState<number | null>(t.category_id);
  const [merchant, setMerchant] = useState(t.merchant ?? "");
  const [amount, setAmount] = useState<number | null>(t.amount);
  const cats = activeCategories(t.kind);
  const c = categoryId !== null ? categoryById.get(categoryId) : undefined;
  const isRec = !!t.recurring_id;
  const variable = !!recurring?.variable_amount;
  const rateNo = recurring && t.recurring_due ? installmentNo(recurring, t.recurring_due) : null;
  const own = isRec ? null : ownTransferReason(t.bank_text ?? "");
  const warn = !!(match || recMatch || own);
  const patch: Partial<NewTransaction> = {
    category_id: categoryId, merchant: merchant.trim() || null,
    category_source: categoryId === t.category_id ? t.category_source ?? null : null,
    ...(isRec && amount ? { amount: round2(amount) } : {}),
  };
  const canAdd = categoryId !== null && (!isRec || (amount !== null && amount > 0));
  const add = () => run(() => confirmPending([{ t, patch }]), "Dodano do budżetu");
  const skip = () => run(() => skipPending([t]), "Pominięto");
  const merge = () => {
    if (match) return run(() => mergePending(t, match), "Połączono – zakup liczy się raz");
    if (recMatch) return run(() => mergeRecurring({ ...t, category_id: categoryId, merchant: merchant.trim() || t.merchant }, recMatch), "Połączono – płatność liczy się raz");
  };

  return (
    <li className={cx("rounded-2xl border p-3 sm:p-4", warn ? "border-amber-300/70 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5" : "border-slate-200 dark:border-white/10")}>
      <div className="flex items-start gap-3">
        <CategoryIcon icon={c?.icon} color={c?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-slate-500 tnum dark:text-slate-400">{dayLabel(t.day)}</span>
            {isRec && <Badge tone="amber"><CalendarClock className="size-3" /> stała płatność</Badge>}
            {!isRec && t.category_source === "history" && categoryId === t.category_id && <Badge tone="green"><History className="size-3" /> z historii</Badge>}
            {!isRec && t.category_source === "ai" && categoryId === t.category_id && <Badge tone="brand"><Sparkles className="size-3" /> podpowiedź</Badge>}
          </div>
          {isRec
            ? <p className="mt-0.5 text-sm font-medium">{recurring?.name ?? t.merchant}
                {rateNo && <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">rata {rateNo} z {recurring!.installments_total}</span>}
                <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{recurring ? frequencyLabel(recurring) : ""}</span></p>
            : <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400" title={t.bank_text ?? ""}>{t.bank_text}</p>}
        </div>
        {!isRec && <div className={cx("shrink-0 text-base font-semibold tnum", t.kind === "income" && "text-emerald-600 dark:text-emerald-400")}>{signedMoney(t.amount, t.kind)}</div>}
      </div>

      {match && (
        <Hint icon={<Link2 className="mt-0.5 size-3.5 shrink-0" />}>
          Ten zakup już jest w aplikacji: {match.type === "receipt" ? "paragon" : "wpis"} „{match.label}” z {dayLabel(match.day)}. Połącz, żeby nie liczyć go dwa razy.
        </Hint>
      )}
      {recMatch && (
        <Hint icon={<Link2 className="mt-0.5 size-3.5 shrink-0" />}>
          Ta płatność już jest {recMatch.status === "pending" ? "na liście z wyciągu" : "w budżecie"}: „{recMatch.merchant || recMatch.bank_text?.slice(0, 60) || "wpis"}” z {dayLabel(recMatch.day)}, {money(recMatch.amount)}.
          {" "}Połącz – zostanie tamta pozycja{recMatch.status === "pending" ? " (z kategorią z tej stałej płatności)" : ""}.
        </Hint>
      )}
      {own && !match && <Hint icon={<ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" />}>{own}</Hint>}

      <div className={cx("mt-3 grid gap-2", isRec ? "sm:grid-cols-[9rem_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]")}>
        {isRec && (
          <div title={variable ? "Kwota zmienna – wpisz kwotę z rachunku" : undefined}>
            <NumberInput value={amount} onChange={setAmount} suffix="zł" placeholder={variable ? "kwota z rachunku" : undefined} />
            {variable && <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300">wpisz kwotę z rachunku</span>}
          </div>
        )}
        <input className="input py-2 text-sm" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={t.kind === "expense" ? "Sklep / komu" : "Od kogo"} />
        <select className="input py-2 text-sm" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— wybierz kategorię —</option>
          {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <div className="flex gap-2">
          {(match || recMatch) && <button className="btn btn-primary flex-1 py-2" disabled={busy} onClick={merge}><Link2 className="size-4" /> Połącz</button>}
          <button className={cx("btn flex-1 py-2", warn ? "btn-secondary" : "btn-primary")} disabled={busy || !canAdd} onClick={add}
            title={categoryId === null ? "Najpierw wybierz kategorię" : undefined}><Check className="size-4" /> Dodaj</button>
          <button className={cx("btn py-2", own && !match ? "btn-primary" : "btn-ghost")} disabled={busy} onClick={skip}><SkipForward className="size-4" /> Pomiń</button>
        </div>
      </div>
    </li>
  );
}

function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">{icon}<span>{children}</span></p>;
}
