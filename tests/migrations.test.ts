import { describe, expect, it } from "vitest";
import { friendlyError, missingMigration } from "../src/lib/migrations";

describe("brakująca migracja w Supabase", () => {
  it("rozpoznaje brak tabeli i kolumny", () => {
    expect(missingMigration("Could not find the table 'public.cf_recurring' in the schema cache")).toBe("recurring");
    expect(missingMigration("Could not find the 'recurring_id' column of 'cf_transactions' in the schema cache")).toBe("recurring");
    expect(missingMigration("Could not find the 'status' column of 'cf_transactions' in the schema cache")).toBe("bank");
    expect(missingMigration('relation "public.cf_import_refs" does not exist')).toBe("bank");
    expect(missingMigration("Invalid login credentials")).toBeNull();
  });
  it("komunikat po polsku z nazwą pliku; inne błędy bez zmian", () => {
    expect(friendlyError("Could not find the table 'public.cf_recurring' in the schema cache")).toContain("20261122000000_recurring.sql");
    expect(friendlyError("Network error")).toBe("Network error");
  });
});
