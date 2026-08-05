-- Run this once in the Supabase SQL editor for the PRIMARY project
-- (the one behind NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
--
-- Production's `stores` table already has a `logo_url` column, read directly
-- by the storefront (never from store_media_assets). Primary has no such
-- column yet, so there's nowhere for a "Set as logo" action to write to.
-- This adds it, mirroring `cover_image`.

alter table public.stores
  add column if not exists logo_url text;
