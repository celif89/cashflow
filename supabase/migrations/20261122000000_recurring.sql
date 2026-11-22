-- Cashflow 1.2.0 – stałe płatności (Netflix co miesiąc, podatek co kwartał, prąd co 2 miesiące…).
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run
-- (po plikach 20261119000000_init.sql i 20261120000000_bank_import.sql).

create table if not exists public.cf_recurring (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    kind text not null default 'expense' check (kind in ('expense', 'income')),
    -- przy zmiennej kwocie (prąd, woda) to kwota orientacyjna – właściwą wpisujesz przy zatwierdzeniu
    amount numeric(12, 2) not null check (amount > 0),
    variable_amount boolean not null default false,
    category_id bigint references public.cf_categories (id) on delete set null,
    merchant text,
    -- co ile miesięcy: 1 = co miesiąc, 3 = co kwartał, 12 = co rok
    every_months integer not null default 1 check (every_months between 1 and 12),
    -- pierwsza płatność; jej dzień miesiąca obowiązuje dalej (31 → ostatni dzień krótszego miesiąca)
    start_date date not null,
    end_date date,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
create index if not exists cf_recurring_user_id on public.cf_recurring (user_id);

alter table public.cf_recurring enable row level security;
drop policy if exists user_own on public.cf_recurring;
create policy user_own on public.cf_recurring for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.cf_recurring to authenticated;

-- Transakcja jako konkretna płatność ze stałej pozycji (np. Netflix za 15 grudnia).
alter table public.cf_transactions
    add column if not exists recurring_id bigint references public.cf_recurring (id) on delete set null,
    add column if not exists recurring_due date;

-- ta sama płatność (pozycja + termin) tylko raz, nawet gdy aplikacja jest otwarta na dwóch urządzeniach
create unique index if not exists cf_transactions_recurring_once
    on public.cf_transactions (user_id, recurring_id, recurring_due);
