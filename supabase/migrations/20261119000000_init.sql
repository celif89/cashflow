-- Cashflow – schemat bazy Supabase.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
--
-- Wszystkie tabele mają przedrostek cf_, więc schemat można wgrać do tego samego
-- projektu co FV Meter i Kilometrówka – nic się nie nadpisze.
--
-- Dostęp: każde zalogowane konto widzi i zmienia wyłącznie swoje wiersze (RLS),
-- tak jak w Kilometrówce. Konta zakłada się w panelu Supabase (Authentication → Users).

-- ---------------------------------------------------------------------------
-- Kategorie (wydatków i przychodów)
-- ---------------------------------------------------------------------------
create table if not exists public.cf_categories (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    kind text not null default 'expense' check (kind in ('expense', 'income')),
    icon text not null default 'Ellipsis',
    color text not null default '#64748b',
    -- miesięczny limit (budżet) dla kategorii; null = bez limitu
    monthly_limit numeric(12, 2) check (monthly_limit is null or monthly_limit > 0),
    position integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists cf_categories_user_id on public.cf_categories (user_id);

-- ---------------------------------------------------------------------------
-- Zeskanowane paragony (pozycje odczytane ze zdjęcia; zdjęcie w Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.cf_receipts (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    day date not null,
    merchant text,
    total numeric(12, 2) not null,
    -- ścieżka w kubełku cf-receipts: <user_id>/<plik>.jpg (null = bez zdjęcia)
    image_path text,
    -- [{ "name": "Mleko 3,2%", "amount": 4.29, "category_id": 1 }, …]
    items jsonb not null default '[]',
    created_at timestamptz not null default now()
);
create index if not exists cf_receipts_user_id on public.cf_receipts (user_id);

-- ---------------------------------------------------------------------------
-- Transakcje
-- ---------------------------------------------------------------------------
create table if not exists public.cf_transactions (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    day date not null,
    amount numeric(12, 2) not null check (amount > 0),
    kind text not null default 'expense' check (kind in ('expense', 'income')),
    category_id bigint references public.cf_categories (id) on delete set null,
    merchant text,
    note text,
    receipt_id bigint references public.cf_receipts (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists cf_transactions_user_day on public.cf_transactions (user_id, day desc, id desc);
create index if not exists cf_transactions_category on public.cf_transactions (category_id);
create index if not exists cf_transactions_receipt on public.cf_transactions (receipt_id);

create table if not exists public.cf_settings (
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    key text not null,
    value text,
    primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- Uprawnienia (RLS): każde konto widzi tylko swoje wiersze
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array['cf_categories', 'cf_receipts', 'cf_transactions', 'cf_settings']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists user_own on public.%I', t);
        execute format('create policy user_own on public.%I for all to authenticated
                        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Zdjęcia paragonów: prywatny kubełek, każde konto ma własny folder <user_id>/
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cf-receipts', 'cf-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists cf_receipts_select on storage.objects;
create policy cf_receipts_select on storage.objects for select to authenticated
    using (bucket_id = 'cf-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists cf_receipts_insert on storage.objects;
create policy cf_receipts_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'cf-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists cf_receipts_delete on storage.objects;
create policy cf_receipts_delete on storage.objects for delete to authenticated
    using (bucket_id = 'cf-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
