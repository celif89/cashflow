// Sprawdzenie na prawdziwym wyciągu (nie trafia do repozytorium):
//   STATEMENT_PDF=/ścieżka/wyciag.pdf npx vitest run tests/pdf-real.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePdfStatement, type PdfItem } from "../src/engine/pdfStatement";

const path = process.env.STATEMENT_PDF;

describe.skipIf(!path)("prawdziwy wyciąg PDF", () => {
  it("odczytuje wszystkie operacje, sumy zgadzają się z nagłówkiem", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(readFileSync(path!)) }).promise;
    const items: PdfItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      for (const it of tc.items) if ("str" in it) items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str });
    }
    const s = parsePdfStatement(items);
    if (process.env.SHOW) console.log(s.lines.slice(0, 12).map((l) => `${l.day} ${l.kind} ${l.amount} | ${l.text}`).join("\n"));
    console.log({ lines: s.lines.length, period: s.period, declared: s.declared, parsed: s.parsed,
      kinds: [...new Set(s.lines.map((l) => l.text.split(" · ")[0]))], maxText: Math.max(...s.lines.map((l) => l.text.length)) });
    expect(s.declared).not.toBeNull();
    expect(s.parsed).toEqual(s.declared);
  });
});
