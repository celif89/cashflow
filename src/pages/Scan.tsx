import { Camera, Check, ImageUp, Plus, Receipt as ReceiptIcon, RotateCcw, ScanLine, Split, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Combobox, confirmAction, cx, EmptyState, Field, Modal, Notice, NumberInput, PageHeader, Spinner, useAction } from "../components/ui";
import { today } from "../engine/dates";
import { round2, sum } from "../engine/money";
import { bankTransactionForReceipt } from "../engine/bank";
import { groupByCategory, itemsGap, receiptTransactions, sanitizeScan } from "../engine/receipt";
import type { Receipt, ReceiptItem } from "../engine/types";
import { deleteReceipt, insertReceipt, insertTransactions, replaceBankTransaction } from "../lib/data";
import { useData } from "../lib/DataContext";
import { dayLabel, money } from "../lib/format";
import { CategoryIcon } from "../lib/icons";
import { type PreparedImage, prepareImage, receiptImageUrl, scanReceipt, uploadReceiptImage } from "../lib/scan";

interface Draft { merchant: string; day: string; total: number | null; items: ReceiptItem[] }

type Stage = { kind: "idle" } | { kind: "working"; label: string } | { kind: "review" } | { kind: "error"; message: string };

export function ScanPage() {
  const { data, reload, activeCategories, merchants, categoryById, openEditor } = useData();
  const { busy, run } = useAction(reload);
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [split, setSplit] = useState(true);
  const [keepImage, setKeepImage] = useState(true);
  const [replaceBank, setReplaceBank] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cats = activeCategories("expense");
  const fallbackCategory = cats.find((c) => /inne/i.test(c.name))?.id ?? null;

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDraft(null);
    try {
      setStage({ kind: "working", label: "Przygotowanie zdjęcia…" });
      const prepared = await prepareImage(file);
      setImg(prepared);
      setStage({ kind: "working", label: "Odczytywanie paragonu… (zwykle 5–20 sekund)" });
      const raw = await scanReceipt(prepared, cats);
      const r = sanitizeScan(raw, data!.categories, today());
      if (r.items.length === 0 && r.total === 0) {
        setStage({ kind: "error", message: "Na zdjęciu nie widać paragonu. Zrób zdjęcie z bliska, przy dobrym świetle, tak żeby cały paragon był płasko w kadrze." });
        return;
      }
      setDraft({ merchant: r.merchant ?? "", day: r.date ?? today(), total: r.total, items: r.items });
      setSplit(new Set(r.items.map((i) => i.category_id)).size > 1);
      setStage({ kind: "review" });
    } catch (e) {
      setStage({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function reset() {
    setStage({ kind: "idle" });
    setDraft(null);
    setImg(null);
  }

  const setItem = (i: number, patch: Partial<ReceiptItem>) =>
    setDraft((d) => d && { ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  async function save() {
    if (!draft || !draft.total || draft.total <= 0) return;
    const r = { merchant: draft.merchant.trim() || null, day: draft.day, total: round2(draft.total), items: draft.items };
    const rows = receiptTransactions(r, split, data!.categories, fallbackCategory);
    const ok = await run(async () => {
      const image_path = keepImage && img ? await uploadReceiptImage(img.blob) : null;
      const receipt_id = await insertReceipt({ ...r, image_path });
      await insertTransactions(rows.map((t) => ({ ...t, receipt_id })));
      // ten zakup był już w budżecie z wyciągu – zostaje rozbicie z paragonu, bez dublowania
      if (bankTwin && replaceBank) await replaceBankTransaction(bankTwin, receipt_id);
    }, rows.length > 1 ? `Zapisano paragon jako ${rows.length} wydatki` : "Zapisano paragon");
    if (ok) reset();
  }

  const groups = draft && draft.total ? groupByCategory({ total: draft.total, items: draft.items }) : [];
  const gap = draft && draft.total ? itemsGap({ total: draft.total, items: draft.items }) : 0;
  const receipts = data!.receipts.slice(0, 12);
  const bankTwin = draft?.total ? bankTransactionForReceipt(draft.total, draft.day, data!.transactions) : null;

  return (
    <>
      <PageHeader eyebrow="Paragony" title="Skanuj paragon"
        subtitle="Zrób zdjęcie – aplikacja odczyta sklep, datę i pozycje, a Ty tylko sprawdzasz i zapisujesz." />

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {(stage.kind === "idle" || stage.kind === "error") && (
        <Card>
          {stage.kind === "error" && (
            <div className="mb-5">
              <Notice tone="error" action={<button className="btn btn-ghost -my-1.5 text-xs" onClick={() => openEditor()}>Wpisz ręcznie</button>}>
                {stage.message}
              </Notice>
            </div>
          )}
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-accent-500/20 text-brand-600 dark:from-brand-500/20 dark:to-accent-500/10 dark:text-brand-300">
              <ScanLine className="size-8" />
            </div>
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <button className="btn btn-primary flex-1 py-3" onClick={() => cameraRef.current?.click()}><Camera className="size-4" /> Zrób zdjęcie</button>
              <button className="btn btn-secondary flex-1 py-3" onClick={() => galleryRef.current?.click()}><ImageUp className="size-4" /> Z galerii</button>
            </div>
            <ul className="mt-6 max-w-sm space-y-1 text-left text-xs text-slate-500 dark:text-slate-400">
              <li>• Połóż paragon płasko na ciemnym tle, bez cienia telefonu.</li>
              <li>• Cały paragon w kadrze; długi paragon możesz sfotografować z dalszej odległości.</li>
              <li>• Wyblakły paragon termiczny? Lepiej przy dziennym świetle.</li>
            </ul>
          </div>
        </Card>
      )}

      {stage.kind === "working" && (
        <Card>
          <div className="flex flex-col items-center gap-5 py-6">
            {img && <img src={img.url} alt="Paragon" className="max-h-72 rounded-2xl object-contain shadow-lg" />}
            <Spinner label={stage.label} />
          </div>
        </Card>
      )}

      {stage.kind === "review" && draft && (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          {img && (
            <button className="hidden self-start overflow-hidden rounded-3xl shadow-lg lg:block" onClick={() => setZoom(true)} title="Powiększ">
              <img src={img.url} alt="Paragon" className="w-full" />
            </button>
          )}
          <Card title="Sprawdź odczyt" subtitle="Popraw, jeśli coś się nie zgadza – zwłaszcza kategorie."
            actions={<>
              {img && <button className="btn btn-secondary lg:hidden" onClick={() => setZoom(true)}><ReceiptIcon className="size-4" /> Zdjęcie</button>}
              <button className="btn btn-ghost" onClick={reset}><RotateCcw className="size-4" /> Od nowa</button>
            </>}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sklep"><Combobox value={draft.merchant} onChange={(v) => setDraft({ ...draft, merchant: v })} options={merchants} placeholder="np. Biedronka" /></Field>
              <Field label="Data"><input className="input" type="date" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} /></Field>
              <Field label="Suma z paragonu"><NumberInput value={draft.total} onChange={(v) => setDraft({ ...draft, total: v })} suffix="zł" /></Field>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="label mb-0">Pozycje ({draft.items.length})</span>
                <button className="btn btn-ghost -my-1 text-xs" onClick={() => setDraft({ ...draft, items: [...draft.items, { name: "", amount: 0, category_id: fallbackCategory }] })}>
                  <Plus className="size-3.5" /> Dodaj pozycję
                </button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
                {draft.items.map((it, i) => {
                  const c = it.category_id !== null ? categoryById.get(it.category_id) : undefined;
                  return (
                    <li key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_12rem_7rem_auto]">
                      <input className="col-span-3 min-w-0 bg-transparent text-sm font-medium outline-none sm:col-span-1" value={it.name}
                        placeholder="Nazwa" onChange={(e) => setItem(i, { name: e.target.value })} />
                      <label className="flex min-w-0 items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-1 dark:bg-white/5">
                        <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                        <select className="min-w-0 flex-1 truncate bg-transparent text-xs outline-none" value={it.category_id ?? ""}
                          onChange={(e) => setItem(i, { category_id: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">bez kategorii</option>
                          {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      </label>
                      <ItemAmount value={it.amount} onChange={(v) => setItem(i, { amount: v })} />
                      <button className="btn btn-ghost btn-icon size-8 text-slate-400" aria-label="Usuń pozycję"
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
              {gap !== 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Pozycje dają {money(sum(draft.items.map((x) => x.amount)))}, a paragon {money(draft.total ?? 0)} (różnica {money(gap)}).
                  Przy zapisie różnica trafi do największej kategorii – albo popraw kwoty.
                </p>
              )}
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-2xl bg-slate-200/60 p-1 dark:bg-white/5">
                  {[{ v: true, l: <><Split className="size-3.5" /> Na kategorie</> }, { v: false, l: "Jeden wydatek" }].map((o) => (
                    <button key={String(o.v)} onClick={() => setSplit(o.v)}
                      className={cx("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                        split === o.v ? "bg-white shadow-sm dark:bg-ink-700" : "text-slate-500 dark:text-slate-400")}>{o.l}</button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} />
                  Zachowaj zdjęcie (gwarancja, zwrot)
                </label>
              </div>
              {bankTwin && (
                <label className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={replaceBank} onChange={(e) => setReplaceBank(e.target.checked)} />
                  <span>Ten zakup już jest w budżecie z wyciągu ({bankTwin.merchant || "płatność"}, {dayLabel(bankTwin.day)}, {money(bankTwin.amount)}). Zastąp go paragonem, żeby nie liczyć dwa razy.</span>
                </label>
              )}
              <ul className="mt-3 space-y-1.5">
                {(split ? groups : [{ category_id: groups[0]?.category_id ?? fallbackCategory, amount: draft.total ?? 0 }]).map((g) => {
                  const c = g.category_id !== null ? categoryById.get(g.category_id) : undefined;
                  return (
                    <li key={String(g.category_id)} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2"><CategoryIcon icon={c?.icon} color={c?.color} size="sm" /> {c?.name ?? "Bez kategorii"}</span>
                      <b className="tnum">{money(g.amount)}</b>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="btn btn-secondary" onClick={reset}>Anuluj</button>
              <button className="btn btn-primary min-w-40" disabled={busy || !draft.total || draft.total <= 0} onClick={save}>
                <Check className="size-4" /> {busy ? "Zapisywanie…" : "Zapisz paragon"}
              </button>
            </div>
          </Card>
        </div>
      )}

      <div className="mt-8">
        <Card title="Ostatnie paragony" pad={false}>
          <div className="px-3 pb-3 sm:px-4">
            {receipts.length === 0
              ? <EmptyState icon={<ReceiptIcon className="size-6" />} title="Brak zeskanowanych paragonów">Zapisane paragony pojawią się tutaj razem ze zdjęciem.</EmptyState>
              : <ul className="divide-y divide-slate-100 dark:divide-white/5">
                  {receipts.map((r) => (
                    <li key={r.id}>
                      <button className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03]" onClick={() => setOpenReceipt(r)}>
                        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"><ReceiptIcon className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.merchant || "Paragon"}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{dayLabel(r.day)} · {r.items.length} poz.</span>
                        </span>
                        <span className="text-sm font-semibold tnum">{money(r.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>}
          </div>
        </Card>
      </div>

      {zoom && img && (
        <Modal open onClose={() => setZoom(false)} title="Zdjęcie paragonu" wide>
          <img src={img.url} alt="Paragon" className="mx-auto rounded-xl" />
        </Modal>
      )}
      {openReceipt && (
        <ReceiptModal receipt={openReceipt} onClose={() => setOpenReceipt(null)}
          onDelete={async () => {
            if (!confirmAction("Usunąć paragon razem z jego wydatkami?")) return;
            const ok = await run(() => deleteReceipt(openReceipt), "Usunięto paragon");
            if (ok) setOpenReceipt(null);
          }}
          onShow={() => navigate(`/transakcje?m=${openReceipt.day.slice(0, 7)}`)} />
      )}
    </>
  );
}

/** Kwota pozycji: dopuszcza minus (rabat, zwrot kaucji). */
function ItemAmount({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const show = (v: number) => v.toFixed(2).replace(".", ",");
  const [text, setText] = useState(show(value));
  useEffect(() => { if (Number(text.replace(",", ".")) !== value) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="w-20 rounded-xl bg-slate-50 px-2 py-1 text-right text-sm font-semibold tnum outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-full dark:bg-white/5"
      inputMode="decimal" value={text}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^-?\d*[.,]?\d{0,2}$/.test(t)) return;
        setText(t);
        const n = Number(t.replace(",", "."));
        if (!Number.isNaN(n)) onChange(round2(n));
      }} />
  );
}

function ReceiptModal({ receipt, onClose, onDelete, onShow }: { receipt: Receipt; onClose: () => void; onDelete: () => void; onShow: () => void }) {
  const { categoryById } = useData();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (receipt.image_path) void receiptImageUrl(receipt.image_path).then(setUrl);
  }, [receipt.image_path]);
  return (
    <Modal open onClose={onClose} title={receipt.merchant || "Paragon"} wide
      footer={<>
        <button className="btn btn-danger mr-auto" onClick={onDelete}><Trash2 className="size-4" /> Usuń</button>
        <button className="btn btn-secondary" onClick={onShow}>Pokaż w transakcjach</button>
        <button className="btn btn-primary" onClick={onClose}>Zamknij</button>
      </>}>
      <p className="text-sm text-slate-500 dark:text-slate-400">{dayLabel(receipt.day)} · suma <b className="text-slate-900 dark:text-slate-100">{money(receipt.total)}</b></p>
      <div className={cx("mt-4 grid gap-4", receipt.image_path && "sm:grid-cols-2")}>
        {receipt.image_path && (url
          ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Paragon" className="w-full rounded-xl shadow" /></a>
          : <Spinner label="Wczytywanie zdjęcia…" />)}
        <ul className="divide-y divide-slate-100 text-sm dark:divide-white/5">
          {receipt.items.map((it, i) => {
            const c = it.category_id !== null ? categoryById.get(it.category_id) : undefined;
            return (
              <li key={i} className="flex items-center gap-2 py-1.5">
                <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className="tnum">{money(it.amount)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
