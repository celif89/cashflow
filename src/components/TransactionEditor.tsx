import { AlertTriangle, CalendarClock, Receipt, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { toDay, today } from "../engine/dates";
import { round2 } from "../engine/money";
import { type Duplicate, findDuplicate } from "../engine/duplicates";
import { FREQUENCIES, frequencyLabel } from "../engine/recurring";
import type { Kind, NewTransaction } from "../engine/types";
import { deleteTransactions, insertRecurring, insertTransactions, linkFirstPayment, updateTransaction } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, monthName } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { Badge, Combobox, cx, Field, Modal, NumberInput, Segmented, useAction } from "./ui";

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return toDay(d); };

export function TransactionEditor() {
  const { data, editor, closeEditor, reload, activeCategories, merchants, categoryById } = useData();
  const { busy, run } = useAction(reload);
  const existing = editor?.id ? data?.transactions.find((t) => t.id === editor.id) : undefined;

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [day, setDay] = useState(today());
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  /** 0 = jednorazowo; inaczej co ile miesięcy powtarzać (nowa stała płatność) */
  const [repeat, setRepeat] = useState(0);

  // przy każdym otwarciu: dane edytowanej transakcji albo pusty formularz
  useEffect(() => {
    if (!editor) return;
    const k = existing?.kind ?? editor.kind ?? "expense";
    setKind(k);
    setAmount(existing?.amount ?? null);
    setCategoryId(existing?.category_id ?? null);
    setDay(existing?.day ?? editor.day ?? today());
    setMerchant(existing?.merchant ?? "");
    setNote(existing?.note ?? "");
    setRepeat(0);
  }, [editor, existing]);

  if (!editor || !data) return null;
  const cats = activeCategories(kind);
  // archiwalna kategoria edytowanej transakcji też musi być do wyboru
  const current = categoryId !== null ? categoryById.get(categoryId) : undefined;
  const choices = current && !cats.includes(current) ? [...cats, current] : cats;
  const valid = amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day);
  // ten sam wydatek drugi raz w tym miesiącu? (ostrzeżenie, nie blokada)
  const dup = findDuplicate({ day, amount, kind, merchant: merchant.trim() || null, category_id: categoryId, excludeId: existing?.id },
    [...data.transactions, ...data.pending], data.recurring);

  const future = /^\d{4}-\d{2}-\d{2}$/.test(day) && day > today();
  // nowy wpis z datą w przyszłości i „powtarzaj” → zapisujemy tylko stałą płatność (bez wydatku i bez „spłaconej” raty)
  const onlyPlan = !!repeat && future && !existing;

  async function save() {
    if (!valid) return;
    const row: NewTransaction = {
      day, kind, amount: round2(amount!), category_id: categoryId,
      merchant: merchant.trim() || null, note: note.trim() || null, receipt_id: existing?.receipt_id ?? null,
    };
    const ok = await run(async () => {
      let id = existing?.id;
      if (existing) await updateTransaction(existing.id, row);
      // data w przyszłości + „powtarzaj”: bez wydatku – pierwsza płatność pojawi się do sprawdzenia w swoim terminie
      else if (!onlyPlan) id = (await insertTransactions([row]))[0];
      // „powtarzaj”: ta transakcja jest pierwszą płatnością nowej stałej pozycji
      if (repeat && (id || onlyPlan)) {
        const recId = await insertRecurring({
          name: row.merchant || (categoryId !== null ? categoryById.get(categoryId)?.name : null) || (kind === "expense" ? "Stały wydatek" : "Stały przychód"),
          kind, amount: row.amount, variable_amount: false, category_id: categoryId, merchant: row.merchant,
          every_months: repeat, start_date: day, end_date: null, active: true,
        });
        if (id && !onlyPlan) await linkFirstPayment(id, recId, day);
      }
    }, onlyPlan ? `Zapisano stałą płatność – pierwsza pojawi się do sprawdzenia ${dayLabel(day)}`
      : repeat ? "Zapisano – kolejne płatności pojawią się do zatwierdzenia" : existing ? "Zapisano zmiany" : kind === "expense" ? "Dodano wydatek" : "Dodano przychód");
    if (ok) closeEditor();
  }

  async function remove() {
    if (!existing) return;
    const { id: _id, created_at: _c, ...copy } = existing;
    const ok = await run(() => deleteTransactions([existing.id]), "Usunięto", {
      label: "Cofnij", run: () => void run(() => insertTransactions([copy]), "Przywrócono"),
    });
    if (ok) closeEditor();
  }

  return (
    <Modal open onClose={closeEditor} title={existing ? "Edycja transakcji" : kind === "expense" ? "Nowy wydatek" : "Nowy przychód"}
      footer={<>
        {existing && <button className="btn btn-danger mr-auto" disabled={busy} onClick={remove}><Trash2 className="size-4" /> Usuń</button>}
        <button className="btn btn-secondary" onClick={closeEditor}>Anuluj</button>
        <button className="btn btn-primary min-w-28" disabled={!valid || busy} onClick={save}>
          {busy ? "Zapisywanie…" : onlyPlan ? "Zapisz stałą płatność" : dup ? (existing ? "Zapisz mimo to" : "Dodaj mimo to") : "Zapisz"}
        </button>
      </>}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }}
            options={[{ value: "expense", label: "Wydatek" }, { value: "income", label: "Przychód" }]} />
          {existing?.receipt_id && <Badge tone="brand"><Receipt className="size-3" /> z paragonu</Badge>}
          {existing?.bank_ref && !existing.receipt_id && <Badge tone="slate">z wyciągu</Badge>}
        </div>
        {existing?.bank_text && <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">Opis z banku: {existing.bank_text}</p>}

        <Field label="Kwota">
          <NumberInput value={amount} onChange={setAmount} suffix="zł" placeholder="0,00" autoFocus={!existing} />
        </Field>

        <div>
          <span className="label">Kategoria</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {choices.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={cx("flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center text-[11.5px] leading-tight font-medium transition",
                  categoryId === c.id
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-500/10"
                    : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20")}>
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-2">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data">
            <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
            <div className="mt-1.5 flex gap-1.5">
              {[["Dziś", today()], ["Wczoraj", yesterday()]].map(([l, d]) => (
                <button key={l} type="button" onClick={() => setDay(d)}
                  className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", day === d ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300")}>
                  {l}
                </button>
              ))}
            </div>
            {future && !repeat && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Data w przyszłości – wpis zobaczysz w miesiącu {monthName(day.slice(0, 7))} (Pulpit → strzałka w prawo).</span>}
          </Field>
          <Field label={kind === "expense" ? "Sklep / komu" : "Od kogo"}>
            <Combobox value={merchant} onChange={setMerchant} options={merchants} placeholder={kind === "expense" ? "np. Biedronka" : "np. pracodawca"} />
          </Field>
        </div>

        {dup && <DuplicateWarning dup={dup} month={day.slice(0, 7)} onGoReview={closeEditor} />}

        <Field label="Notatka">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcjonalnie" />
        </Field>

        {!existing?.recurring_id && !existing?.receipt_id && !data.missing.includes("recurring") && (
          <Field label="Powtarzaj" hint={repeat
            ? onlyPlan
              ? `${frequencyLabel({ every_months: repeat, start_date: day })}. Data jest w przyszłości, więc zapiszę tylko stałą płatność, bez wydatku – pierwsza pojawi się w „Do sprawdzenia” ${dayLabel(day)}. Raty ustawisz w Ustawieniach → Stałe płatności.`
              : `${frequencyLabel({ every_months: repeat, start_date: day })} – ten wpis to pierwsza płatność, kolejne pojawią się w „Do sprawdzenia”. Zmienisz to w Ustawieniach → Stałe płatności.`
            : undefined}>
            <select className="input" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              <option value={0}>Nie – jednorazowo</option>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label[0].toUpperCase() + f.label.slice(1)}</option>)}
            </select>
          </Field>
        )}
        {existing?.recurring_id && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><CalendarClock className="size-3.5" /> Płatność ze stałej pozycji – ustawienia w Ustawieniach → Stałe płatności.</p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function DuplicateWarning({ dup, month, onGoReview }: { dup: Duplicate; month: string; onGoReview: () => void }) {
  const first = dup.items[0];
  const pending = dup.items.some((t) => t.status === "pending");
  const where = monthName(month).split(" ")[0];
  const head = {
    same: `Taki sam wydatek jest już w tym miesiącu (${where}).`,
    recurring: dup.reason === "recurring" ? `„${dup.recurring.name}” to stała płatność i w tym miesiącu (${where}) już jest.` : "",
    monthly: `${first.merchant} płacisz zwykle raz w miesiącu, a w tym miesiącu (${where}) jest już wpis.`,
  }[dup.reason];
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{head}</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {dup.items.slice(0, 3).map((t) => (
            <li key={t.id} className="tnum">
              {dayLabel(t.day).slice(0, 5)} · {t.merchant || "bez nazwy"} · {money(t.amount)}
              {t.status === "pending" && <span className="ml-1 font-medium">(czeka w „Do sprawdzenia”)</span>}
            </li>
          ))}
          {dup.items.length > 3 && <li>… i {dup.items.length - 3} kolejne</li>}
        </ul>
        <p className="mt-1.5 text-xs">
          {pending
            ? <>Zamiast dodawać nowy wpis, zatwierdź tamten w <Link to="/do-sprawdzenia" className="font-semibold underline" onClick={onGoReview}>Do sprawdzenia</Link>.</>
            : "Jeśli to rzeczywiście druga płatność, zapisz mimo to."}
        </p>
      </div>
    </div>
  );
}
