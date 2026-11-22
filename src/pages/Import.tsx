import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, cx, Notice, PageHeader, Spinner, useAction, useToast } from "../components/ui";
import { type Layout, layoutOk } from "../engine/bank";
import { round2 } from "../engine/money";
import { insertPending, saveSetting } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money, plural, signedMoney } from "../lib/format";
import { csvLines, knownRefs, prepare, readStatement, type StatementFile, suggestWithAi } from "../lib/importer";

type Stage = { kind: "idle" } | { kind: "working"; label: string } | { kind: "error"; message: string };

export function ImportPage() {
  const { data, reload } = useData();
  const toast = useToast();
  const { busy, run } = useAction(reload);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [file, setFile] = useState<StatementFile | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  const navigate = useNavigate();
  const pending = data!.pending;

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
      navigate("/do-sprawdzenia");
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

      {pending.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn" action={<Link to="/do-sprawdzenia" className="btn btn-secondary -my-1.5 py-1.5 text-xs">Sprawdź</Link>}>
            Do sprawdzenia: {plural(pending.length, "pozycja", "pozycje", "pozycji")}.
          </Notice>
        </div>
      )}
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
