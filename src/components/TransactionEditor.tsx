import { Receipt, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toDay, today } from "../engine/dates";
import { round2 } from "../engine/money";
import type { Kind, NewTransaction } from "../engine/types";
import { deleteTransactions, insertTransactions, updateTransaction } from "../lib/data";
import { useData } from "../lib/DataContext";
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
  }, [editor, existing]);

  if (!editor || !data) return null;
  const cats = activeCategories(kind);
  // archiwalna kategoria edytowanej transakcji też musi być do wyboru
  const current = categoryId !== null ? categoryById.get(categoryId) : undefined;
  const choices = current && !cats.includes(current) ? [...cats, current] : cats;
  const valid = amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day);

  async function save() {
    if (!valid) return;
    const row: NewTransaction = {
      day, kind, amount: round2(amount!), category_id: categoryId,
      merchant: merchant.trim() || null, note: note.trim() || null, receipt_id: existing?.receipt_id ?? null,
    };
    const ok = await run(async () => {
      if (existing) await updateTransaction(existing.id, row);
      else await insertTransactions([row]);
    }, existing ? "Zapisano zmiany" : kind === "expense" ? "Dodano wydatek" : "Dodano przychód");
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
        <button className="btn btn-primary min-w-28" disabled={!valid || busy} onClick={save}>{busy ? "Zapisywanie…" : "Zapisz"}</button>
      </>}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null); }}
            options={[{ value: "expense", label: "Wydatek" }, { value: "income", label: "Przychód" }]} />
          {existing?.receipt_id && <Badge tone="brand"><Receipt className="size-3" /> z paragonu</Badge>}
        </div>

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
          </Field>
          <Field label={kind === "expense" ? "Sklep / komu" : "Od kogo"}>
            <Combobox value={merchant} onChange={setMerchant} options={merchants} placeholder={kind === "expense" ? "np. Biedronka" : "np. pracodawca"} />
          </Field>
        </div>

        <Field label="Notatka">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcjonalnie" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
