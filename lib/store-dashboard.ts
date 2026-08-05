import { supabase } from './supabase';

export type Store = {
  id: string;
  name: string;
  phone: string | null;
  area: string | null;
  city: string | null;
  street_address: string | null;
  full_address: string | null;
  slug: string | null;
  cover_image: string | null;
  logo_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  description: string | null;
  is_active: boolean;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  google_place_id: string | null;
  source: string | null;
  source_payload: unknown;
  last_synced_at: string | null;
  rating: number | string | null;
  user_ratings_total: number | string | null;
  place_types: string[] | null;
  country: string | null;
  category: string | null;
  subcategory: string | null;
  isapproved: boolean | null;
};

export type StoreOpeningHour = {
  id: string;
  store_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
};

export type StoreMediaAsset = {
  id: string;
  store_id: string;
  asset_type: 'logo' | 'cover' | 'gallery';
  file_url: string;
  file_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  google_photo_reference: string | null;
  local_file_path: string | null;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_public_url: string | null;
};

export type StoreTag = {
  id: string;
  store_id: string;
  tag_type: string;
  tag_value: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type StoreBundle = {
  store: Store;
  openingHours: StoreOpeningHour[];
  mediaAssets: StoreMediaAsset[];
  tags: StoreTag[];
};

export type StoreUpdateInput = Partial<
  Pick<
    Store,
    | 'name'
    | 'phone'
    | 'area'
    | 'city'
    | 'street_address'
    | 'full_address'
    | 'slug'
    | 'cover_image'
    | 'logo_url'
    | 'latitude'
    | 'longitude'
    | 'description'
    | 'is_active'
    | 'google_place_id'
    | 'source'
    | 'source_payload'
    | 'rating'
    | 'user_ratings_total'
    | 'place_types'
    | 'country'
    | 'category'
    | 'subcategory'
    | 'isapproved'
  >
>;

export type StoreOpeningHourInput = Partial<Pick<StoreOpeningHour, 'day_of_week' | 'open_time' | 'close_time' | 'is_closed'>>;
export type StoreMediaAssetInput = Partial<
  Pick<
    StoreMediaAsset,
    | 'asset_type'
    | 'file_url'
    | 'file_path'
    | 'sort_order'
    | 'is_active'
    | 'google_photo_reference'
    | 'local_file_path'
    | 'mime_type'
    | 'storage_bucket'
    | 'storage_path'
    | 'storage_public_url'
  >
>;

function normalizeOpeningHourInput(changes: StoreOpeningHourInput) {
  if (!changes.is_closed) {
    return changes;
  }

  return {
    ...changes,
    open_time: null,
    close_time: null,
    is_closed: true
  };
}

function normalizeOpeningHourRow(row: StoreOpeningHourInput) {
  const normalized = normalizeOpeningHourInput(row);

  return {
    day_of_week: normalized.day_of_week,
    open_time: normalized.open_time ?? null,
    close_time: normalized.close_time ?? null,
    is_closed: normalized.is_closed ?? false
  };
}

const storeSelect = `
  id, name, phone, area, city, street_address, full_address, slug, cover_image, logo_url, latitude, longitude,
  description, is_active, owner_user_id, created_at, updated_at, google_place_id, source, source_payload,
  last_synced_at, rating, user_ratings_total, place_types, country, category, subcategory, isapproved
`;

export async function fetchStores(includeApproved = false) {
  const query = supabase.from('stores').select(storeSelect).order('created_at', { ascending: false });

  query.eq('isapproved', includeApproved);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as Store[];
}

export async function fetchApprovedStoreCount() {
  const { count, error } = await supabase.from('stores').select('*', { count: 'exact', head: true }).eq('isapproved', true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchPendingStoreCount() {
  const { count, error } = await supabase.from('stores').select('*', { count: 'exact', head: true }).eq('isapproved', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function isMissingTableError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = ((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return code === 'PGRST205' || message.includes('could not find the table');
}

export async function fetchStoreBundle(id: string): Promise<StoreBundle> {
  const [storeResult, hoursResult, mediaResult, tagsResult] = await Promise.all([
    supabase.from('stores').select(storeSelect).eq('id', id).single(),
    supabase.from('store_opening_hours').select('*').eq('store_id', id).order('day_of_week', { ascending: true }),
    supabase.from('store_media_assets').select('*').eq('store_id', id).order('sort_order', { ascending: true }),
    supabase.from('store_tags').select('*').eq('store_id', id).order('sort_order', { ascending: true })
  ]);

  if (storeResult.error) throw storeResult.error;
  if (hoursResult.error) throw hoursResult.error;
  if (mediaResult.error) throw mediaResult.error;
  // store_tags is a newer table (migration 0002); tolerate it not existing yet
  // instead of breaking the whole bundle load.
  if (tagsResult.error && !isMissingTableError(tagsResult.error)) throw tagsResult.error;

  return {
    store: storeResult.data as Store,
    openingHours: (hoursResult.data ?? []) as StoreOpeningHour[],
    mediaAssets: (mediaResult.data ?? []) as StoreMediaAsset[],
    tags: (tagsResult.data ?? []) as StoreTag[]
  };
}

export async function approveStore(id: string, isapproved: boolean) {
  const response = await fetch('/api/approve-store', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, isapproved })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Failed to approve store');
  }

  return payload;
}

export async function syncStoreMirror(id: string, changes: Record<string, unknown>) {
  const response = await fetch('/api/sync-store', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, changes })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Failed to sync store mirror');
  }

  return payload;
}

export async function updateStore(id: string, changes: StoreUpdateInput) {
  const { error } = await supabase.from('stores').update(changes).eq('id', id);
  if (error) {
    throw error;
  }
}

export async function saveStoreOpeningHour(id: string, changes: StoreOpeningHourInput) {
  const { error } = await supabase.from('store_opening_hours').update(normalizeOpeningHourInput(changes)).eq('id', id);
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('row-level')) {
      throw new Error('Permission denied when updating opening hour. Check Supabase table policies or use a service role key.');
    }

    throw new Error(msg);
  }
}

export async function createStoreOpeningHour(storeId: string, changes: StoreOpeningHourInput) {
  const normalized = normalizeOpeningHourRow(changes);

  if (normalized.day_of_week === undefined || normalized.day_of_week === null) {
    throw new Error('day_of_week is required');
  }

  const { data, error } = await supabase
    .from('store_opening_hours')
    .upsert({ store_id: storeId, ...normalized }, { onConflict: 'store_id,day_of_week' })
    .select('*');
  if (error) {
    const msg = (error as { message?: string; details?: string }).message ?? String(error);
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('row-level')) {
      throw new Error('Permission denied when creating opening hour. Check Supabase table RLS/policies or API keys.');
    }

    throw new Error(msg + (error && typeof error === 'object' && 'details' in error ? `: ${(error as any).details}` : ''));
  }

  return (data ?? [])[0] ?? null;
}

export async function deleteStoreOpeningHour(id: string) {
  const { error } = await supabase.from('store_opening_hours').delete().eq('id', id);
  if (error) {
    throw error;
  }
}

export async function saveStoreMediaAsset(id: string, changes: StoreMediaAssetInput) {
  const { error } = await supabase.from('store_media_assets').update(changes).eq('id', id);
  if (error) {
    throw error;
  }
}

export async function createStoreMediaAsset(storeId: string, changes: StoreMediaAssetInput) {
  const { error } = await supabase.from('store_media_assets').insert({ store_id: storeId, ...changes });
  if (error) {
    throw error;
  }
}

export async function deleteStoreMediaAsset(id: string) {
  const { error } = await supabase.from('store_media_assets').delete().eq('id', id);
  if (error) {
    throw error;
  }
}

// The storefront only ever reads tag_type='tag' for stores
// (store_tags.eq('tag_type', 'tag') in passprive), so that's the only kind
// of store tag written here.
export async function saveStoreTags(storeId: string, tagValues: string[]) {
  function isPermissionError(error: unknown) {
    const err = error as { status?: number | string; code?: string; message?: string } | null;
    const status = typeof err?.status === 'string' ? Number(err.status) : err?.status;
    const message = (err?.message ?? '').toLowerCase();

    return (
      status === 401 ||
      status === 403 ||
      err?.code === '401' ||
      err?.code === '403' ||
      err?.code === '42501' ||
      message.includes('unauthorized') ||
      message.includes('row-level security') ||
      message.includes('permission denied')
    );
  }

  const deleteResult = await supabase.from('store_tags').delete().eq('store_id', storeId);
  if (deleteResult.error) {
    if (isMissingTableError(deleteResult.error)) {
      return { saved: false as const, warning: 'Store saved, but tags could not be updated: run migration 0002_add_store_tags.sql first.' };
    }
    if (isPermissionError(deleteResult.error)) {
      return { saved: false as const, warning: 'Store saved, but tags could not be updated due to table permissions.' };
    }

    throw deleteResult.error;
  }

  const normalizedTags = tagValues
    .map((value, index) => ({
      store_id: storeId,
      tag_type: 'tag',
      tag_value: value.trim(),
      sort_order: index
    }))
    .filter((tag) => tag.tag_value.length > 0);

  if (!normalizedTags.length) {
    return { saved: true as const };
  }

  const insertResult = await supabase.from('store_tags').insert(normalizedTags);
  if (insertResult.error) {
    if (isPermissionError(insertResult.error)) {
      return { saved: false as const, warning: 'Store saved, but tags could not be updated due to table permissions.' };
    }

    throw insertResult.error;
  }

  return { saved: true as const };
}
