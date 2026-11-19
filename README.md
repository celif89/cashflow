# Cashflow

Budżet domowy w przeglądarce: wydatki i przychody w kategoriach, wykresy, limity miesięczne
i skanowanie paragonów zdjęciem z telefonu.

- React 19 + Vite + Tailwind 4, wykresy Recharts
- dane i logowanie: Supabase (tabele `cf_*`, ten sam projekt co FV Meter i Kilometrówka)
- hosting: Netlify; funkcja `netlify/functions/scan-receipt.mts` odczytuje paragon przez Claude API
  (klucz `ANTHROPIC_API_KEY` tylko po stronie serwera, wywołanie wymaga zalogowania w Supabase)

Uruchomienie krok po kroku: [INSTRUKCJA.md](INSTRUKCJA.md).

## Praca lokalna

```bash
npm install
cp .env.example .env.local   # uzupełnij adres i klucz Supabase
npm run dev                  # bez skanowania paragonów
npx netlify dev              # razem z funkcją skanowania (potrzebny ANTHROPIC_API_KEY)
```

Przed commitem: `npm run typecheck && npm test && npm run build`.

Model do odczytu paragonów można zmienić zmienną `RECEIPT_MODEL` w Netlify (domyślnie `claude-opus-5-5`).
