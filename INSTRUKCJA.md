# Cashflow – instrukcja uruchomienia

Aplikacja stoi na tych samych darmowych usługach co FV Meter i Kilometrówka. Supabase trzyma dane
i logowanie, Netlify wyświetla stronę (np. `cashflow-apc.netlify.app`) i uruchamia małą funkcję,
która odczytuje zdjęcia paragonów. Do samego odczytu potrzebny jest jeszcze klucz Anthropic (Claude).

Najprościej użyć **tego samego projektu Supabase co FV Meter**: tabele Cashflow mają przedrostek
`cf_`, więc niczego nie nadpiszą, a zalogujesz się tym samym e-mailem i hasłem.

---

## Krok 1: Tabele w Supabase

1. Wejdź na **https://supabase.com** i otwórz projekt **fv-meter**.
2. W menu po lewej kliknij **SQL Editor** → **New query**.
3. Otwórz w nowej karcie plik:
   https://github.com/celif89/cashflow/blob/claude/gracious-lovelace-4mtl7k/supabase/migrations/20261119000000_init.sql
   i kliknij ikonę **Copy raw file** (dwa kwadraciki nad treścią pliku, po prawej).
4. Wróć do Supabase, wklej treść i kliknij **Run**. Na dole powinno pojawić się
   **„Success. No rows returned”**.

Ten sam plik zakłada też prywatny „kubełek” `cf-receipts` na zdjęcia paragonów
(Supabase → **Storage**). Każde konto widzi tylko swoje zdjęcia.

## Krok 2: Klucz do skanowania paragonów

1. Wejdź na **https://console.anthropic.com** i załóż konto (albo zaloguj się).
2. **Settings → Billing**: doładuj konto, wystarczy najmniejsza kwota (5 USD).
3. **Settings → API Keys → Create Key**, nazwa np. `cashflow`. Skopiuj klucz (zaczyna się od `sk-ant-`)
   – pokazuje się tylko raz.

Koszt: według cennika to orientacyjnie 5–20 groszy za paragon (krótki paragon z Żabki taniej,
długi z zakupów na cały tydzień drożej), czyli przy 50 paragonach miesięcznie kilka złotych. Bieżące zużycie widać w konsoli Anthropic (**Usage**); możesz tam też ustawić miesięczny limit.

Bez klucza aplikacja działa normalnie, tylko przycisk skanowania pokaże błąd.

## Krok 3: Strona na Netlify

1. Wejdź na **https://app.netlify.com** → **Add new project** → **Import an existing project** → **GitHub**.
2. Wybierz repozytorium **celif89/cashflow** (jeśli go nie widzisz: „Configure the Netlify app
   on GitHub” i daj dostęp do tego repozytorium).
3. Ustawienia budowania wczytają się same z pliku `netlify.toml`.
   Jako gałąź (*Branch to deploy*) wybierz `claude/gracious-lovelace-4mtl7k`.
4. **Add environment variables** – dodaj trzy zmienne. Dwie pierwsze są takie same jak w FV Meter
   (podejrzysz je w Netlify: strona FV Meter → **Site configuration → Environment variables**):

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | adres projektu Supabase, np. `https://abcdefgh.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | klucz **publishable** / **anon** |
   | `ANTHROPIC_API_KEY` | klucz z kroku 2 (`sk-ant-…`) |

   Klucz Anthropic jest tajny: zaznacz przy nim **Contains secret values**. Trafia tylko do funkcji
   na serwerze Netlify, przeglądarka go nie dostaje.

5. Kliknij **Deploy**. Po ok. minucie strona będzie gotowa. Jeśli zmienne dodajesz po pierwszym
   wdrożeniu: **Deploys → Trigger deploy → Deploy site**.
6. (opcjonalnie) **Site configuration → Change site name**, np. `cashflow-apc`.

## Krok 4: Pierwsze uruchomienie

1. Otwórz stronę i zaloguj się tym samym e-mailem i hasłem co w FV Meter.
2. Aplikacja sama założy zestaw kategorii (Spożywcze, Mieszkanie i rachunki, Transport i paliwo…).
   Zmienisz je w **Ustawieniach**: nazwy, ikony, kolory, kolejność i limity miesięczne.
3. Dodaj wynagrodzenie jako **przychód** – wtedy Pulpit pokaże saldo miesiąca.
4. **Telefon**: otwórz adres w przeglądarce i wybierz „Dodaj do ekranu głównego”. Aplikacja
   uruchamia się wtedy jak zwykła apka, a przycisk **Skanuj → Zrób zdjęcie** od razu otwiera aparat.

## Skanowanie paragonu

1. **Skanuj → Zrób zdjęcie** (albo **Z galerii**). Najlepiej paragon płasko, na ciemnym tle, cały w kadrze.
2. Po kilku–kilkunastu sekundach pojawi się sklep, data, suma i lista pozycji z podpowiedzianą kategorią.
   Popraw to, co się nie zgadza.
3. **Na kategorie** zapisze paragon jako kilka wydatków (np. jedzenie osobno, chemia osobno),
   **Jeden wydatek** – jako jedną pozycję w kategorii, w której było najwięcej.
4. Zdjęcie zostaje w Supabase (przydaje się przy reklamacji). Ostatnie paragony są na dole ekranu
   Skanuj; usunięcie paragonu usuwa też jego wydatki.

Jeśli odczyt kończy się błędem „trwał za długo”, spróbuj ponownie. Darmowy Netlify przerywa funkcje
po kilkudziesięciu sekundach, a długie, pogniecione paragony czyta się dłużej.

## Konto dla drugiej osoby

Każde konto ma osobne dane (tak jak w Kilometrówce).

1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Wpisz e-mail i hasło, zaznacz **Auto Confirm User**, kliknij **Create user**.
3. Ta osoba otwiera ten sam adres aplikacji i loguje się swoim e-mailem i hasłem.

## Kopia danych

**Ustawienia → Pobierz CSV** – wszystkie transakcje w pliku, który otwiera się w Excelu
(średniki, polskie przecinki).
