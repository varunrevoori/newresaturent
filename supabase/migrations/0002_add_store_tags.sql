-- Run this once in the Supabase SQL editor for the PRIMARY project
-- (the one behind NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
--
-- Primary has no store_tags table yet (production/main DB already has one).
-- This mirrors restaurant_tags' shape so the Stores admin can manage tags
-- the same way it manages restaurant cuisine/mood/facility tags, then sync
-- them to production on approve.

create table if not exists public.store_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  tag_type text not null default 'tag',
  tag_value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_tags_store_id_idx on public.store_tags (store_id);
