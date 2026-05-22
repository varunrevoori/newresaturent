import { supabase } from './supabase';

export type Restaurant = {
  id: string;
  name: string;
  phone: string | null;
  area: string | null;
  city: string | null;
  full_address: string | null;
  slug: string | null;
  cover_image: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  description: string | null;
  cost_for_two: number | string | null;
  is_active: boolean;
  owner_user_id: string | null;
  is_pure_veg: boolean;
  booking_enabled: boolean;
  avg_duration_minutes: number | string;
  max_bookings_per_slot: number | string | null;
  advance_booking_days: number | string;
  modification_available: boolean;
  modification_cutoff_minutes: number | string | null;
  cancellation_available: boolean;
  cancellation_cutoff_minutes: number | string | null;
  cover_charge_enabled: boolean;
  cover_charge_amount: number | string | null;
  created_at: string;
  updated_at: string;
  is_advertised: boolean;
  ad_priority: number | string | null;
  ad_starts_at: string | null;
  ad_ends_at: string | null;
  ad_badge_text: string | null;
  booking_terms: string[];
  menu_json: unknown;
  google_place_id: string | null;
  source: string | null;
  source_payload: unknown;
  last_synced_at: string | null;
  rating: number | string | null;
  user_ratings_total: number | string | null;
  place_types: string[] | null;
  country: string | null;
  isapproved: boolean | null;
  ai_summary: string | null;
};

export type OpeningHour = {
  id: string;
  restaurant_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
};

export type MediaAsset = {
  id: string;
  restaurant_id: string;
  asset_type: 'food' | 'ambience' | 'menu';
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

export type RestaurantTagType = 'cuisine' | 'facility' | 'highlight' | 'worth_visit' | 'mood';

export type RestaurantTag = {
  id: string;
  restaurant_id: string;
  tag_type: RestaurantTagType;
  tag_value: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  restaurant_id: string;
  user_id: string;
  rating: number | string;
  review_text: string | null;
  liked_tags: string[];
  photo_urls: string[];
  username_snapshot: string | null;
  avatar_snapshot: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  food_rating: number | string | null;
  service_rating: number | string | null;
  ambience_rating: number | string | null;
  drinks_rating: number | string | null;
  crowd_rating: number | string | null;
  owner_reply_text: string | null;
  owner_reply_by: string | null;
  owner_reply_at: string | null;
  owner_reply_updated_at: string | null;
  source: string | null;
  external_review_id: string | null;
};

export type RestaurantBundle = {
  restaurant: Restaurant;
  openingHours: OpeningHour[];
  mediaAssets: MediaAsset[];
  tags: RestaurantTag[];
  reviews: Review[];
};

export type RestaurantUpdateInput = Partial<
  Pick<
    Restaurant,
    | 'name'
    | 'phone'
    | 'area'
    | 'city'
    | 'full_address'
    | 'slug'
    | 'cover_image'
    | 'latitude'
    | 'longitude'
    | 'description'
    | 'cost_for_two'
    | 'is_active'
    | 'is_pure_veg'
    | 'booking_enabled'
    | 'avg_duration_minutes'
    | 'max_bookings_per_slot'
    | 'advance_booking_days'
    | 'modification_available'
    | 'modification_cutoff_minutes'
    | 'cancellation_available'
    | 'cancellation_cutoff_minutes'
    | 'cover_charge_enabled'
    | 'cover_charge_amount'
    | 'is_advertised'
    | 'ad_priority'
    | 'ad_starts_at'
    | 'ad_ends_at'
    | 'ad_badge_text'
    | 'booking_terms'
    | 'menu_json'
    | 'google_place_id'
    | 'source'
    | 'source_payload'
    | 'rating'
    | 'user_ratings_total'
    | 'place_types'
    | 'country'
    | 'isapproved'
    | 'ai_summary'
  >
>;

export type OpeningHourInput = Partial<Pick<OpeningHour, 'day_of_week' | 'open_time' | 'close_time' | 'is_closed'>>;
export type MediaAssetInput = Partial<Pick<MediaAsset, 'asset_type' | 'file_url' | 'file_path' | 'sort_order' | 'is_active' | 'google_photo_reference' | 'local_file_path' | 'mime_type' | 'storage_bucket' | 'storage_path' | 'storage_public_url'>>;
export type ReviewInput = Partial<Pick<Review, 'rating' | 'review_text' | 'is_approved' | 'food_rating' | 'service_rating' | 'ambience_rating' | 'drinks_rating' | 'crowd_rating' | 'owner_reply_text' | 'source' | 'external_review_id'>> & {
  liked_tags?: string[];
  photo_urls?: string[];
};

function normalizeOpeningHourInput(changes: OpeningHourInput) {
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

function normalizeOpeningHourRow(row: OpeningHourInput) {
  const normalized = normalizeOpeningHourInput(row);

  return {
    day_of_week: normalized.day_of_week,
    open_time: normalized.open_time ?? null,
    close_time: normalized.close_time ?? null,
    is_closed: normalized.is_closed ?? false
  };
}

const restaurantSelect = `
  id, name, phone, area, city, full_address, slug, cover_image, latitude, longitude,
  description, ai_summary, cost_for_two, is_active, owner_user_id, is_pure_veg, booking_enabled,
  avg_duration_minutes, max_bookings_per_slot, advance_booking_days, modification_available,
  modification_cutoff_minutes, cancellation_available, cancellation_cutoff_minutes,
  cover_charge_enabled, cover_charge_amount, created_at, updated_at, is_advertised,
  ad_priority, ad_starts_at, ad_ends_at, ad_badge_text, booking_terms, menu_json,
  google_place_id, source, source_payload, last_synced_at, rating, user_ratings_total,
  place_types, country, isapproved
`;

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  }

  return value.replace(/\/rest\/v1\/?$/, '');
}

export async function fetchRestaurants(includeApproved = false) {
  const query = supabase.from('restaurants').select(restaurantSelect).order('created_at', { ascending: false });

  query.eq('isapproved', includeApproved);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as Restaurant[];
}

export async function fetchApprovedCount() {
  const { count, error } = await supabase
    .from('restaurants')
    .select('*', { count: 'exact', head: true })
    .eq('isapproved', true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchPendingCount() {
  const { count, error } = await supabase
    .from('restaurants')
    .select('*', { count: 'exact', head: true })
    .eq('isapproved', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchRestaurantBundle(id: string): Promise<RestaurantBundle> {
  const [restaurantResult, hoursResult, mediaResult, tagsResult, reviewsResult] = await Promise.all([
    supabase.from('restaurants').select(restaurantSelect).eq('id', id).single(),
    supabase.from('restaurant_opening_hours').select('*').eq('restaurant_id', id).order('day_of_week', { ascending: true }),
    supabase.from('restaurant_media_assets').select('*').eq('restaurant_id', id).order('sort_order', { ascending: true }),
    supabase.from('restaurant_tags').select('*').eq('restaurant_id', id).order('tag_type', { ascending: true }).order('sort_order', { ascending: true }),
    supabase.from('restaurant_reviews').select('*').eq('restaurant_id', id).order('created_at', { ascending: false })
  ]);

  if (restaurantResult.error) throw restaurantResult.error;
  if (hoursResult.error) throw hoursResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (tagsResult.error) throw tagsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;

  return {
    restaurant: restaurantResult.data as Restaurant,
    openingHours: (hoursResult.data ?? []) as OpeningHour[],
    mediaAssets: (mediaResult.data ?? []) as MediaAsset[],
    tags: (tagsResult.data ?? []) as RestaurantTag[],
    reviews: (reviewsResult.data ?? []) as Review[]
  };
}

export async function approveRestaurant(id: string, isapproved: boolean) {
  const response = await fetch('/api/approve-restaurant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, isapproved })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Failed to approve restaurant');
  }

  return payload;
}

export async function syncRestaurantMirror(id: string, changes: Record<string, unknown>) {
  const response = await fetch('/api/sync-restaurant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, changes })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Failed to sync restaurant mirror');
  }

  return payload;
}

export async function updateRestaurant(id: string, changes: RestaurantUpdateInput) {
  const { error } = await supabase.from('restaurants').update(changes).eq('id', id);
  if (error) {
    throw error;
  }
}

export async function saveOpeningHour(id: string, changes: OpeningHourInput) {
  const { error } = await supabase.from('restaurant_opening_hours').update(normalizeOpeningHourInput(changes)).eq('id', id);
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('row-level')) {
      throw new Error('Permission denied when updating opening hour. Check Supabase table policies or use a service role key.');
    }

    throw new Error(msg);
  }
}

export async function createOpeningHour(restaurantsId: string, changes: OpeningHourInput) {
  const normalized = normalizeOpeningHourRow(changes);

  if (normalized.day_of_week === undefined || normalized.day_of_week === null) {
    throw new Error('day_of_week is required');
  }

  const { data, error } = await supabase
    .from('restaurant_opening_hours')
    .upsert({ restaurant_id: restaurantsId, ...normalized }, { onConflict: 'restaurant_id,day_of_week' })
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

export async function deleteOpeningHour(id: string) {
  const { error } = await supabase.from('restaurant_opening_hours').delete().eq('id', id);
  if (error) {
    throw error;
  }
}

export async function saveMediaAsset(id: string, changes: MediaAssetInput) {
  const { error } = await supabase.from('restaurant_media_assets').update(changes).eq('id', id);
  if (error) {
    throw error;
  }
}

export async function createMediaAsset(restaurantsId: string, changes: MediaAssetInput) {
  const { error } = await supabase.from('restaurant_media_assets').insert({ restaurant_id: restaurantsId, ...changes });
  if (error) {
    throw error;
  }
}

export async function deleteMediaAsset(id: string) {
  const { error } = await supabase.from('restaurant_media_assets').delete().eq('id', id);
  if (error) {
    throw error;
  }
}

export async function saveRestaurantTags(
  restaurantId: string,
  tags: Array<{
    tag_type: RestaurantTagType;
    tag_value: string;
    sort_order: number;
  }>
) {
  function isAuthError(error: unknown) {
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
      message.includes('permission denied') ||
      message.includes('violates row-level security policy')
    );
  }

  function errorMessage(prefix: string, error: unknown) {
    const err = error as { message?: string; details?: string; hint?: string } | null;
    const details = [err?.message, err?.details, err?.hint].filter(Boolean).join(' | ');
    return details ? `${prefix}: ${details}` : prefix;
  }

  const deleteResult = await supabase.from('restaurant_tags').delete().eq('restaurant_id', restaurantId);
  if (deleteResult.error) {
    if (isAuthError(deleteResult.error)) {
      return { saved: false as const, warning: 'Restaurant saved, but mood tags could not be updated due to table permissions.' };
    }

    throw new Error(errorMessage('Failed to delete existing restaurant tags', deleteResult.error));
  }

  const normalizedTags = tags
    .map((tag) => ({
      restaurant_id: restaurantId,
      tag_type: tag.tag_type,
      tag_value: tag.tag_value.trim(),
      sort_order: tag.sort_order
    }))
    .filter((tag) => tag.tag_value.length > 0);

  if (!normalizedTags.length) {
    return { saved: true as const };
  }

  const insertResult = await supabase.from('restaurant_tags').insert(normalizedTags);
  if (insertResult.error) {
    if (isAuthError(insertResult.error)) {
      return { saved: false as const, warning: 'Restaurant saved, but mood tags could not be updated due to table permissions.' };
    }

    throw new Error(errorMessage('Failed to insert restaurant tags', insertResult.error));
  }

  return { saved: true as const };
}

export async function saveReview(id: string, changes: ReviewInput) {
  const { error } = await supabase.from('restaurant_reviews').update(changes).eq('id', id);
  if (error) {
    throw error;
  }
}

export function dayLabel(dayOfWeek: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function arrayFromText(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function textFromArray(value: string[] | null | undefined) {
  return (value ?? []).join(', ');
}

export function nullableString(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function stringValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

export function nullableNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseJsonText(value: string) {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  return JSON.parse(trimmed);
}

export function safeParseJsonText(value: string) {
  try {
    return parseJsonText(value);
  } catch {
    return value;
  }
}

export function resolveSupabaseError(message: string, error: unknown) {
  if (error instanceof Error) {
    return `${message}: ${error.message}`;
  }

  return message;
}

export function ensureSupabaseConfig() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  }

  return { url, key };
}
