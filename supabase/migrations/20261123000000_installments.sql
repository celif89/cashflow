-- Cashflow 1.5.0 – raty (kredyt, zakup na raty): liczba rat i ile spłacono przed pierwszą płatnością w aplikacji.
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run
-- (po pliku 20261122000000_recurring.sql).

alter table public.cf_recurring
    -- wszystkich rat (null = zwykła stała płatność bez końca)
    add column if not exists installments_total integer,
    -- ile rat było spłaconych przed terminem z „start_date” (np. 8 z 10 → start_date to termin 9. raty)
    add column if not exists installments_paid_before integer not null default 0;

alter table public.cf_recurring drop constraint if exists cf_recurring_installments_check;
alter table public.cf_recurring add constraint cf_recurring_installments_check check (
    installments_total is null
    or (installments_total between 1 and 600 and installments_paid_before between 0 and installments_total)
);
