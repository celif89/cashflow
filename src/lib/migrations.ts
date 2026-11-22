// Pliki SQL, które trzeba uruchomić w Supabase, i zrozumiałe komunikaty, gdy któregoś brakuje.

const REPO = "https://github.com/celif89/cashflow/blob/claude/gracious-lovelace-4mtl7k/supabase/migrations/";

export const MIGRATIONS = {
  bank: { file: "20261120000000_bank_import.sql", version: "1.1.0", what: "import z banku" },
  recurring: { file: "20261122000000_recurring.sql", version: "1.2.0", what: "stałe płatności" },
} as const;

export type MigrationKey = keyof typeof MIGRATIONS;

export const migrationUrl = (k: MigrationKey) => REPO + MIGRATIONS[k].file;

const TABLE_TO_MIGRATION: Record<string, MigrationKey> = { cf_import_refs: "bank", cf_recurring: "recurring" };
const COLUMN_TO_MIGRATION: Record<string, MigrationKey> = {
  status: "bank", bank_ref: "bank", bank_text: "bank", category_source: "bank",
  recurring_id: "recurring", recurring_due: "recurring",
};

/** Która migracja jest potrzebna, sądząc po błędzie Supabase (null = to inny błąd). */
export function missingMigration(message: string): MigrationKey | null {
  const table = /Could not find the table 'public\.(cf_\w+)'/.exec(message)?.[1] ?? /relation "(?:public\.)?(cf_\w+)" does not exist/.exec(message)?.[1];
  if (table && TABLE_TO_MIGRATION[table]) return TABLE_TO_MIGRATION[table];
  const column = /Could not find the '(\w+)' column/.exec(message)?.[1] ?? /column [\w.]*?"?(\w+)"? does not exist/.exec(message)?.[1];
  if (column && COLUMN_TO_MIGRATION[column]) return COLUMN_TO_MIGRATION[column];
  return null;
}

/** Błąd Supabase → komunikat po polsku z instrukcją, gdy brakuje migracji. */
export function friendlyError(message: string): string {
  const k = missingMigration(message);
  if (!k) return message;
  const m = MIGRATIONS[k];
  return `W Supabase brakuje tabel dla funkcji „${m.what}” (wersja ${m.version}). Uruchom plik ${m.file} w SQL Editor – link w INSTRUKCJA.md, krok 1.`;
}
