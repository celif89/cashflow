import { ArrowLeftRight, Check, CheckCheck, FileUp, Link2, Sparkles, SkipForward, History } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge, Card, cx, EmptyState, Notice, PageHeader, Spinner, useAction, useToast } from "../components/ui";
import { type Layout, layoutOk, type Match, matchExisting, ownTransferReason } from "../engine/bank";
import { round2 } from "../engine/money";
import type { NewTransaction, Transaction } from "../engine/types";
import { confirmPending, insertPending, mergePending, saveSetting, skipPending } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, signedMoney } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { csvLines, isConfident, knownRefs, prepare, readStatement, type StatementFile, suggestWithAi } from "../lib/importer";

type Stage = { kind: "idle" } | { kind: "working"; label: string } | { kind: "error"; message: string };

export function ImportPage() {
  const { data, reload } = useData();
  const toast = useToast();
  const { busy, run } = useAction(reload);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [file, setFile] = useState<StatementFile | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  const pending = data!.pending;
  const matches = useMemo(() => matchExisting(pending, data!.receipts, data!.transactions), [pending, data]);
  const confident = pending.filter((t) => isConfident(t, matches.has(t.id)));

  // linie z pliku (CSV – według bieżącego układu kolumn)
  const lines = useMemo(() => {
    if (!file) return [];
    if (file.format === "csv" && file.csv && layout) return csvLines(file.csv.rows, layout).lines;
    return file.lines;
  }, [file, layout]);
  const known = useMemo(() => knownRefs(data!), [data]);
  const fresh = lines.filter((l) => !known.has(l.ref));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFile(null);
    setStage({ kind: "working", label: "Odczytywanie pliku…" });
    try {
      const s = await readStatement(f, data!.settings);
      setFile(s);
      setLayout(s.csv?.layout ?? null);
      setStage({ kind: "idle" });
    } catch (e) {
      setStage({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function startImport() {
    if (!file || !fresh.length) return;
    const { rows, aiNeeded } = prepare(fresh, data!);
    let aiError: string | null = null;
    if (aiNeeded.length) {
      setStage({ kind: "working", label: `Dobieranie kategorii (0/${aiNeeded.length})…` });
      aiError = await suggestWithAi(rows, aiNeeded, data!.categories,
        (done) => setStage({ kind: "working", label: `Dobieranie kategorii (${done}/${aiNeeded.length})…` }));
    }
    setStage({ kind: "working", label: "Zapisywanie…" });
    const ok = await run(async () => {
      if (file.format === "csv" && file.csv && layout) await saveSetting(`bank_layout:${file.csv.signature}`, JSON.stringify(layout));
      await insertPending(rows);
    }, `Dodano ${rows.length} pozycji do sprawdzenia`);
    setStage({ kind: "idle" });
    if (ok) {
      setFile(null);
      if (aiError) toast({ tone: "error", text: `Części pozycji nie udało się przypisać kategorii (${aiError}) – wybierz je ręcznie.` });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Transakcje" title="Import z banku"
        subtitle="Wczytaj wyciąg – pozycje trafią do sprawdzenia i dopiero po Twoim zatwierdzeniu do budżetu." />

      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.csv,.txt,application/pdf,text/csv"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {!file && (
        <Card>
          {stage.kind === "error" && <div className="mb-4"><Notice tone="error">{stage.message}</Notice></div>}
          {stage.kind === "working"
            ? <div className="py-6"><Spinner label={stage.label} /></div>
            : (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <button className="btn btn-primary py-3" onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> Wybierz plik wyciągu</button>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <b>Alior Bank:</b> wyciąg PDF (Historia → Wyciągi). <b>Inny bank:</b> historia rachunku jako CSV.
                  Plik jest czytany w przeglądarce; pozycje, które już wczytałeś, zostaną pominięte.
                </p>
              </div>
            )}
        </Card>
      )}

      {file && (
        <Card title={file.name} subtitle={file.check?.period ? `Okres ${file.check.period.replace(/\./g, "-").replace(" - ", " – ")}` : undefined}
          actions={<button className="btn btn-ghost" onClick={() => setFile(null)}>Anuluj</button>}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Operacji w pliku: <b>{lines.length}</b></span>
            <span>Nowych: <b>{fresh.length}</b></span>
            {lines.length - fresh.length > 0 && <span className="text-slate-500 dark:text-slate-400">już wczytane: {lines.length - fresh.length}</span>}
          </div>
          {file.check && <PdfCheck check={file.check} />}
          {file.csv && layout && <LayoutEditor rows={file.csv.rows} layout={layout} onChange={setLayout} />}
          {lines.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm dark:divide-white/5 dark:border-white/10">
              {lines.slice(0, 5).map((l) => (
                <li key={l.ref} className={cx("flex items-center gap-3 px-3 py-2", known.has(l.ref) && "opacity-50")}>
                  <span className="w-20 shrink-0 text-xs text-slate-500 tnum">{dayLabel(l.day)}</span>
                  <span className="min-w-0 flex-1 truncate">{l.text}</span>
                  <span className={cx("shrink-0 font-semibold tnum", l.kind === "income" && "text-emerald-600 dark:text-emerald-400")}>{signedMoney(l.amount, l.kind)}</span>
                </li>
              ))}
              {lines.length > 5 && <li className="px-3 py-2 text-xs text-slate-500">… i {lines.length - 5} kolejnych</li>}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {stage.kind === "working" && <Spinner label={stage.label} />}
            <button className="btn btn-primary" disabled={!fresh.length || stage.kind === "working" || busy} onClick={startImport}>
              <FileUp className="size-4" /> {fresh.length ? `Dodaj ${fresh.length} do sprawdzenia` : "Brak nowych pozycji"}
            </button>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Card title={`Do sprawdzenia (${pending.length})`} pad={false}
          subtitle={pending.length ? "Zatwierdź, popraw albo pomiń każdą pozycję. Dopóki tego nie zrobisz, nie liczy się do budżetu." : undefined}
          actions={confident.length > 0 ? (
            <button className="btn btn-secondary" disabled={busy}
              title="Pozycje z kategorią z Twojej historii, bez podejrzenia duplikatu i przelewu własnego"
              onClick={() => void run(() => confirmPending(confident.map((t) => ({ t }))), `Zatwierdzono ${confident.length} pozycji`)}>
              <CheckCheck className="size-4" /> Zatwierdź pewne ({confident.length})
            </button>
          ) : undefined}>
          <div className="px-3 pb-4 sm:px-4">
            {pending.length === 0
              ? <EmptyState icon={<CheckCheck className="size-6" />} title="Wszystko sprawdzone">Po wczytaniu wyciągu pozycje pojawią się tutaj.</EmptyState>
              : <ul className="space-y-3">{pending.map((t) => <PendingRow key={t.id} t={t} match={matches.get(t.id)} busy={busy} run={run} />)}</ul>}
          </div>
        </Card>
      </div>
    </>
  );
}

function PdfCheck({ check }: { check: NonNullable<StatementFile["check"]> }) {
  if (!check.declared) return null;
  const ok = round2(check.declared.credit) === round2(check.parsed.credit) && round2(check.declared.debit) === round2(check.parsed.debit);
  return (
    <div className="mt-3">
      <Notice tone={ok ? "ok" : "warn"}>
        {ok
          ? <>Sumy zgadzają się z wyciągiem: wpływy {money(check.declared.credit)}, wydatki {money(check.declared.debit)}.</>
          : <>Sumy nie zgadzają się z wyciągiem (wpływy {money(check.parsed.credit)} zamiast {money(check.declared.credit)}, wydatki {money(check.parsed.debit)} zamiast {money(check.declared.debit)}) – część operacji mogła się nie odczytać. Daj znać, to poprawię odczyt.</>}
      </Notice>
    </div>
  );
}

/** Ręczna poprawka układu kolumn CSV (zapamiętywana dla tego banku przy imporcie). */
function LayoutEditor({ rows, layout, onChange }: { rows: string[][]; layout: Layout; onChange: (l: Layout) => void }) {
  const header = layout.headerRow >= 0 ? rows[layout.headerRow] : null;
  const width = Math.max(...rows.slice(layout.headerRow + 1, layout.headerRow + 30).map((r) => r.length), header?.length ?? 0);
  const name = (i: number) => (header?.[i] ? header[i].replace(/^#/, "") : `Kolumna ${i + 1}`);
  const opts = Array.from({ length: width }, (_, i) => i);
  const split = layout.amount === null;
  const sel = (label: string, value: number | null, set: (v: number | null) => void, optional = false) => (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <select className="input py-2 text-sm" value={value ?? ""} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}>
        {optional && <option value="">—</option>}
        {opts.map((i) => <option key={i} value={i}>{name(i)}</option>)}
      </select>
    </label>
  );
  return (
    <details className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.03]" open={!layoutOk(layout)}>
      <summary className="cursor-pointer text-sm font-medium">Kolumny pliku {layoutOk(layout) ? "(rozpoznane – rozwiń, żeby poprawić)" : "– wskaż, gdzie jest data i kwota"}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {sel("Data", layout.date, (v) => onChange({ ...layout, date: v ?? -1 }))}
        {!split
          ? sel("Kwota (minus = wydatek)", layout.amount, (v) => onChange({ ...layout, amount: v }))
          : <>
              {sel("Wydatki (obciążenia)", layout.debit, (v) => onChange({ ...layout, debit: v }))}
              {sel("Wpływy (uznania)", layout.credit, (v) => onChange({ ...layout, credit: v }))}
            </>}
      </div>
      <button className="mt-2 text-xs text-slate-500 underline" onClick={() => onChange(split
        ? { ...layout, amount: layout.debit ?? 0, debit: null, credit: null }
        : { ...layout, debit: layout.amount ?? 0, credit: layout.amount ?? 0, amount: null })}>
        {split ? "Kwota jest w jednej kolumnie" : "Wydatki i wpływy są w osobnych kolumnach"}
      </button>
      <div className="mt-3">
        <span className="label">Opis (zaznacz kolumny)</span>
        <div className="flex flex-wrap gap-2">
          {opts.filter((i) => i !== layout.date && i !== layout.amount && i !== layout.debit && i !== layout.credit).map((i) => (
            <label key={i} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-xs shadow-xs dark:bg-white/5">
              <input type="checkbox" className="accent-brand-600" checked={layout.text.includes(i)}
                onChange={(e) => onChange({ ...layout, text: e.target.checked ? [...layout.text, i].sort((a, b) => a - b) : layout.text.filter((x) => x !== i) })} />
              {name(i)}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function PendingRow({ t, match, busy, run }: {
  t: Transaction; match?: Match; busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
}) {
  const { activeCategories, categoryById } = useData();
  const [categoryId, setCategoryId] = useState<number | null>(t.category_id);
  const [merchant, setMerchant] = useState(t.merchant ?? "");
  const cats = activeCategories(t.kind);
  const c = categoryId !== null ? categoryById.get(categoryId) : undefined;
  const own = ownTransferReason(t.bank_text ?? "");
  const patch: Partial<NewTransaction> = {
    category_id: categoryId, merchant: merchant.trim() || null,
    category_source: categoryId === t.category_id ? t.category_source ?? null : null,
  };
  const add = () => run(() => confirmPending([{ t, patch }]), "Dodano do budżetu");
  const skip = () => run(() => skipPending([t]), "Pominięto");
  const merge = () => match && run(() => mergePending(t, match), "Połączono – zakup liczy się raz");

  return (
    <li className={cx("rounded-2xl border p-3 sm:p-4", match || own ? "border-amber-300/70 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5" : "border-slate-200 dark:border-white/10")}>
      <div className="flex items-start gap-3">
        <CategoryIcon icon={c?.icon} color={c?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-slate-500 tnum dark:text-slate-400">{dayLabel(t.day)}</span>
            {t.category_source === "history" && categoryId === t.category_id && <Badge tone="green"><History className="size-3" /> z historii</Badge>}
            {t.category_source === "ai" && categoryId === t.category_id && <Badge tone="brand"><Sparkles className="size-3" /> podpowiedź</Badge>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400" title={t.bank_text ?? ""}>{t.bank_text}</p>
        </div>
        <div className={cx("shrink-0 text-base font-semibold tnum", t.kind === "income" && "text-emerald-600 dark:text-emerald-400")}>{signedMoney(t.amount, t.kind)}</div>
      </div>

      {match && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
          <Link2 className="mt-0.5 size-3.5 shrink-0" />
          Ten zakup już jest w aplikacji: {match.type === "receipt" ? "paragon" : "wpis"} „{match.label}” z {dayLabel(match.day)}. Połącz, żeby nie liczyć go dwa razy.
        </p>
      )}
      {own && !match && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
          <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" /> {own}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className="input py-2 text-sm" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={t.kind === "expense" ? "Sklep / komu" : "Od kogo"} />
        <select className="input py-2 text-sm" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— wybierz kategorię —</option>
          {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <div className="flex gap-2">
          {match && <button className="btn btn-primary flex-1 py-2" disabled={busy} onClick={merge}><Link2 className="size-4" /> Połącz</button>}
          <button className={cx("btn flex-1 py-2", match || own ? "btn-secondary" : "btn-primary")} disabled={busy || categoryId === null} onClick={add}
            title={categoryId === null ? "Najpierw wybierz kategorię" : undefined}><Check className="size-4" /> Dodaj</button>
          <button className={cx("btn py-2", own && !match ? "btn-primary" : "btn-ghost")} disabled={busy} onClick={skip}><SkipForward className="size-4" /> Pomiń</button>
        </div>
      </div>
    </li>
  );
}
