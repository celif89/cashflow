# Cashflow – zasady dla zmian

- Aplikacja: React 19 + Vite + Tailwind 4, dane w Supabase (tabele `cf_*`, kubełek Storage `cf-receipts`),
  hosting Netlify, odczyt paragonów w funkcji `netlify/functions/scan-receipt.mts` (Claude API). Teksty w UI po polsku.
- Przed commitem: `npm run typecheck && npm test && npm run build`.
- Kwoty liczymy w groszach (`src/engine/money.ts`), nie sumuj floatów bezpośrednio.
- Logika bez Reacta (statystyki, paragony) w `src/engine/` – z testami w `tests/`.
- **Każde wydanie ma numer wersji i listę zmian**:
  1. podnieś `version` w `package.json` (poprawki → 1.0.1, nowe funkcje → 1.1.0),
  2. dopisz wpis na górze `RELEASES` w `src/changelog.ts`,
  3. ten sam wpis w `CHANGELOG.md`.
  Test `tests/changelog.test.ts` sprawdza, że te trzy miejsca się zgadzają.
- Drobne poprawki zbieraj i wypychaj razem jako jedno wydanie. Wyjątek: pilny błąd, który blokuje korzystanie z aplikacji.
- Zmiany schematu bazy: nowy plik w `supabase/migrations/` (nie edytuj już wgranych) i krok w INSTRUKCJA.md.
- Klucz `ANTHROPIC_API_KEY` nigdy z przedrostkiem `VITE_` (trafiłby do przeglądarki).
