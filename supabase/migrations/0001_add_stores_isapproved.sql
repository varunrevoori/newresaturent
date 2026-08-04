-- Run this once in the Supabase SQL editor for the PRIMARY project
-- (the one behind NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
--
-- Mirrors the moderation flag that already exists on public.restaurants so the
-- Stores tab in this dashboard can use the same pending/approved workflow.

alter table public.stores
  add column if not exists isapproved boolean not null default false;

create index if not exists stores_isapproved_idx on public.stores (isapproved);
