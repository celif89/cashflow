import type { Category, Transaction } from "../engine/types";

/** CSV dla polskiego Excela: średnik jako separator, przecinek dziesiętny, BOM UTF-8. */
export function transactionsCsv(txs: Transaction[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Data", "Rodzaj", "Kwota", "Kategoria", "Sklep / od kogo", "Notatka", "Z paragonu"];
  const rows = [...txs]
    .sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id)
    .map((t) => [
      t.day,
      t.kind === "expense" ? "wydatek" : "przychód",
      (t.kind === "expense" ? -t.amount : t.amount).toFixed(2).replace(".", ","),
      t.category_id !== null ? names.get(t.category_id) ?? "" : "",
      t.merchant ?? "",
      t.note ?? "",
      t.receipt_id ? "tak" : "",
    ].map(esc).join(";"));
  return "﻿" + [head.join(";"), ...rows].join("\r\n");
}

export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
