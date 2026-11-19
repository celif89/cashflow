import { Archive, ArrowDown, ArrowUp, Download, Pencil, Plus, Sparkles, Tags, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, confirmAction, cx, Field, Modal, NumberInput, PageHeader, Segmented, useAction } from "../components/ui";
import { APP_VERSION } from "../changelog";
import { today } from "../engine/dates";
import { CATEGORY_COLORS } from "../engine/defaults";
import type { Category, Kind } from "../engine/types";
import { transactionsCsv, download } from "../lib/csv";
import { type CategoryInput, deleteCategory, insertCategory, reorderCategories, updateCategory } from "../lib/data";
import { useData } from "../lib/DataContext";
import { moneyRound } from "../lib/format";
import { CategoryIcon, ICONS } from "../lib/icons";
import { supabase } from "../lib/supabase";

export function SettingsPage() {
  const { data, reload } = useData();
  const { run } = useAction(reload);
  const [kind, setKind] = useState<Kind>("expense");
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [email, setEmail] = useState("");
  useEffect(() => { void supabase.auth.getUser().then(({ data: u }) => setEmail(u.user?.email ?? "")); }, []);

  const all = data!.categories.filter((c) => c.kind === kind);
  const list = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const used = new Map<number, number>();
  for (const t of data!.transactions) if (t.category_id !== null) used.set(t.category_id, (used.get(t.category_id) ?? 0) + 1);

  const move = (i: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(() => reorderCategories([...ids, ...archived.map((c) => c.id)]));
  };

  return (
    <>
      <PageHeader eyebrow="Ustawienia" title="Kategorie i dane" />

      <Card title="Kategorie" icon={<Tags className="size-4" />} subtitle="Kolejność taka jak przy dodawaniu wydatku. Limit miesięczny pokazuje się na Pulpicie."
        actions={<button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="size-4" /> Nowa</button>}>
        <Segmented value={kind} onChange={setKind} options={[{ value: "expense", label: "Wydatki" }, { value: "income", label: "Przychody" }]} />
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/5">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {c.monthly_limit ? `limit ${moneyRound(c.monthly_limit)} / mies.` : kind === "expense" ? "bez limitu" : ""}
                  {used.get(c.id) ? `${c.monthly_limit || kind === "expense" ? " · " : ""}${used.get(c.id)} transakcji` : ""}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="W górę"><ArrowUp className="size-4" /></button>
              <button className="btn btn-ghost btn-icon" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="W dół"><ArrowDown className="size-4" /></button>
              <button className="btn btn-ghost btn-icon" onClick={() => setEdit(c)} aria-label="Edytuj"><Pencil className="size-4" /></button>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <div className="mt-3">
            <button className="text-xs font-medium text-slate-500 underline" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Ukryj" : "Pokaż"} archiwalne ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 divide-y divide-slate-100 opacity-70 dark:divide-white/5">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <span className="flex-1 text-sm">{c.name}</span>
                    <button className="btn btn-ghost text-xs" onClick={() => void run(() => updateCategory(c.id, { archived: false }), "Przywrócono kategorię")}>Przywróć</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Kopia danych" icon={<Download className="size-4" />} subtitle="Wszystkie transakcje w pliku CSV – otwiera się w Excelu.">
          <button className="btn btn-secondary" disabled={!data!.transactions.length}
            onClick={() => download(`cashflow-${today()}.csv`, transactionsCsv(data!.transactions, data!.categories))}>
            <Download className="size-4" /> Pobierz CSV ({data!.transactions.length})
          </button>
        </Card>
        <Card title="Konto i wersja" icon={<Sparkles className="size-4" />}>
          <p className="text-sm text-slate-600 dark:text-slate-300">Zalogowano jako <b>{email}</b></p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/co-nowego" className="btn btn-secondary">Co nowego · v{APP_VERSION}</Link>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Wyloguj</button>
          </div>
        </Card>
      </div>

      {edit && (
        <CategoryModal category={edit === "new" ? null : edit} kind={kind} usedCount={edit === "new" ? 0 : used.get(edit.id) ?? 0}
          position={all.length} onClose={() => setEdit(null)}
          onSave={async (input) => {
            const ok = await run(() => (edit === "new" ? insertCategory(input) : updateCategory(edit.id, input)), "Zapisano kategorię");
            if (ok) setEdit(null);
          }}
          onArchive={edit !== "new" ? async () => {
            const ok = await run(() => updateCategory(edit.id, { archived: true }), "Przeniesiono do archiwum");
            if (ok) setEdit(null);
          } : undefined}
          onDelete={edit !== "new" ? async () => {
            if (!confirmAction(`Usunąć kategorię „${edit.name}”?`)) return;
            const ok = await run(() => deleteCategory(edit.id), "Usunięto kategorię");
            if (ok) setEdit(null);
          } : undefined} />
      )}
    </>
  );
}

function CategoryModal({ category, kind, usedCount, position, onClose, onSave, onArchive, onDelete }: {
  category: Category | null; kind: Kind; usedCount: number; position: number; onClose: () => void;
  onSave: (c: CategoryInput) => void; onArchive?: () => void; onDelete?: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? (kind === "income" ? "Wallet" : "ShoppingCart"));
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[position % (CATEGORY_COLORS.length - 1)]);
  const [limit, setLimit] = useState<number | null>(category?.monthly_limit ?? null);
  const k = category?.kind ?? kind;
  return (
    <Modal open onClose={onClose} title={category ? "Edycja kategorii" : "Nowa kategoria"}
      footer={<>
        {onArchive && usedCount > 0 && <button className="btn btn-ghost mr-auto" onClick={onArchive}><Archive className="size-4" /> Archiwizuj</button>}
        {onDelete && usedCount === 0 && <button className="btn btn-danger mr-auto" onClick={onDelete}><Trash2 className="size-4" /> Usuń</button>}
        <button className="btn btn-secondary" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave({
          name: name.trim(), kind: k, icon, color, monthly_limit: k === "expense" && limit && limit > 0 ? limit : null,
          position: category?.position ?? position, archived: category?.archived ?? false,
        })}>Zapisz</button>
      </>}>
      <div className="space-y-5">
        <div className="flex items-end gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <Field label="Nazwa" className="flex-1"><input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <div>
          <span className="label">Kolor</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                className={cx("size-8 rounded-full ring-offset-2 transition dark:ring-offset-ink-900", color === c && "ring-2 ring-slate-900 dark:ring-white")}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <span className="label">Ikona</span>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-9">
            {Object.entries(ICONS).map(([key, Icon]) => (
              <button key={key} type="button" onClick={() => setIcon(key)} aria-label={key}
                className={cx("flex aspect-square items-center justify-center rounded-xl transition",
                  icon === key ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300")}>
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
        {k === "expense" && (
          <Field label="Limit miesięczny" hint="Puste = bez limitu">
            <NumberInput value={limit} onChange={setLimit} suffix="zł" placeholder="np. 2000" />
          </Field>
        )}
        {category && usedCount > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <Badge>{usedCount} transakcji</Badge> Kategorii z transakcjami nie usuwa się – można ją zarchiwizować: zniknie z wyboru, a historia zostanie.
          </p>
        )}
      </div>
    </Modal>
  );
}
