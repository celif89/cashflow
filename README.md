# Cashflow

Budżet domowy w przeglądarce: wydatki i przychody w kategoriach, wykresy, limity miesięczne,
skanowanie paragonów zdjęciem z telefonu, import wyciągu z banku (PDF z Alior Banku albo CSV)
i stałe płatności – wszystko z kolejką pozycji do zatwierdzenia.

- React 19 + Vite + Tailwind 4, wykresy Recharts
- dane i logowanie: Supabase (tabele `cf_*`, ten sam projekt co FV Meter i Kilometrówka)
- hosting: Netlify; funkcje `netlify/functions/scan-receipt.mts` (odczyt paragonu) i
  `categorize.mts` (kategorie dla nieznanych pozycji z wyciągu) wołają Claude API
  (klucz `ANTHROPIC_API_KEY` tylko po stronie serwera, wywołanie wymaga zalogowania w Supabase)
- import wyciągu: `src/engine/bank.ts` (CSV, podpowiedzi, dopasowanie do paragonów),
  `src/engine/pdfStatement.ts` (PDF Alior Banku, tekst z pdf.js w przeglądarce)

Uruchomienie krok po kroku: [INSTRUKCJA.md](INSTRUKCJA.md).

## Praca lokalna

```bash
npm install
cp .env.example .env.local   # uzupełnij adres i klucz Supabase
npm run dev                  # bez skanowania paragonów
npx netlify dev              # razem z funkcją skanowania (potrzebny ANTHROPIC_API_KEY)
```

Przed commitem: `npm run typecheck && npm test && npm run build`.

Sprawdzenie odczytu na prawdziwym wyciągu PDF (plik zostaje u Ciebie, test wypisuje tylko liczby):

```bash
STATEMENT_PDF=~/Pobrane/wyciag.pdf npx vitest run tests/pdf-real.test.ts
```

Modele można zmienić zmiennymi `RECEIPT_MODEL` i `CATEGORIZE_MODEL` w Netlify (domyślnie `claude-opus-5-5`).
