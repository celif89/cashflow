-- Cashflow 1.1.0 – import wyciągu z banku (plik CSV) z kolejką „Do sprawdzenia”.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run
-- (po pliku 20261119000000_init.sql).

-- Transakcje z banku czekają na zatwierdzenie (status 'pending') i nie liczą się do budżetu,
-- dopóki ich nie zatwierdzisz.
alter table public.cf_transactions
    add column if not exists status text not null default 'confirmed',
    -- odcisk linii wyciągu – ta sama linia nie wczyta się drugi raz
    add column if not exists bank_ref text,
    -- oryginalny opis z banku (np. „Płatność kartą … BIEDRONKA 3021 WROCLAW”)
    add column if not exists bank_text text,
    -- skąd jest kategoria: 'history' (Twoje wcześniejsze wpisy), 'ai' (podpowiedź Claude), null (ręcznie)
    add column if not exists category_source text;

alter table public.cf_transactions drop constraint if exists cf_transactions_status_check;
alter table public.cf_transactions add constraint cf_transactions_status_check check (status in ('confirmed', 'pending'));
create index if not exists cf_transactions_bank_ref on public.cf_transactions (user_id, bank_ref) where bank_ref is not null;

-- Paragon połączony z płatnością z wyciągu (żeby zakupów nie liczyć dwa razy).
alter table public.cf_receipts add column if not exists bank_ref text;

-- Linie wyciągu już rozpatrzone (dodane, połączone albo pominięte) – ponowny import je pomija.
create table if not exists public.cf_import_refs (
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    ref text not null,
    action text not null check (action in ('added', 'merged', 'skipped')),
    created_at timestamptz not null default now(),
    primary key (user_id, ref)
);

alter table public.cf_import_refs enable row level security;
drop policy if exists user_own on public.cf_import_refs;
create policy user_own on public.cf_import_refs for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.cf_import_refs to authenticated;
