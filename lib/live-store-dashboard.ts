// Client helpers for the *live* (second/production) `stores` table --- the
// real rows PassPrivé customers browse on /stores, as opposed to the scraped
// pending queue in the primary DB (see lib/store-dashboard.ts). All reads and
// writes go through server API routes using the service role key, since the
// browser never talks to the production database directly in this app.

export type LiveStore = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  location_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  full_address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  google_place_id: string | null;
  logo_url: string | null;
  cover_image: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_top_brand: boolean;
  sort_order: number;
  store_type: string | null;
  merchant_type: string | null;
  on_boarded: boolean;
  created_at: string;
  updated_at: string;
};

export type LiveStoreOpeningHour = {
  id: string;
  store_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
};

export type LiveStoreMediaAsset = {
  id: string;
  store_id: string;
  asset_type: string;
  file_url: string;
  file_path: string | null;
  sort_order: number;
  is_active: boolean;
};

export type LiveStoreTag = {
  id: string;
  store_id: string;
  tag_type: string;
  tag_value: string;
};

export type LiveStoreOffer = {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  offer_type: string | null;
  discount_value: number | string | null;
  is_active: boolean;
};

export type LiveStoreSocialLink = {
  id: string;
  store_id: string;
  platform: string;
  url: string;
  sort_order: number;
};

export type LiveStoreBundle = {
  store: LiveStore;
  openingHours: LiveStoreOpeningHour[];
  mediaAssets: LiveStoreMediaAsset[];
  tags: LiveStoreTag[];
  offers: LiveStoreOffer[];
  socialLinks: LiveStoreSocialLink[];
  catalogueItemCount: number;
};

export type LiveStoreUpdateInput = Partial<
  Pick<
    LiveStore,
    | 'name'
    | 'slug'
    | 'description'
    | 'category'
    | 'subcategory'
    | 'location_name'
    | 'address_line1'
    | 'address_line2'
    | 'city'
    | 'region'
    | 'country'
    | 'postal_code'
    | 'full_address'
    | 'lat'
    | 'lng'
    | 'google_place_id'
    | 'cover_image'
    | 'logo_url'
    | 'phone'
    | 'whatsapp'
    | 'email'
    | 'website'
    | 'is_active'
    | 'is_featured'
    | 'is_top_brand'
    | 'sort_order'
  >
>;

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function fetchLiveStores(): Promise<LiveStore[]> {
  const response = await fetch('/api/live-stores');
  const payload = await parseJsonResponse(response);
  return (payload?.stores ?? []) as LiveStore[];
}

export async function fetchLiveStoreBundle(id: string): Promise<LiveStoreBundle> {
  const response = await fetch(`/api/live-stores/${id}`);
  const payload = await parseJsonResponse(response);

  return {
    store: payload.store as LiveStore,
    openingHours: (payload.openingHours ?? []) as LiveStoreOpeningHour[],
    mediaAssets: (payload.mediaAssets ?? []) as LiveStoreMediaAsset[],
    tags: (payload.tags ?? []) as LiveStoreTag[],
    offers: (payload.offers ?? []) as LiveStoreOffer[],
    socialLinks: (payload.socialLinks ?? []) as LiveStoreSocialLink[],
    catalogueItemCount: Number(payload.catalogueItemCount ?? 0)
  };
}

export async function updateLiveStore(id: string, changes: LiveStoreUpdateInput) {
  const response = await fetch(`/api/live-stores/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes })
  });

  return parseJsonResponse(response);
}

export type LiveStoreOpeningHourInput = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

export async function saveLiveStoreOpeningHours(storeId: string, rows: LiveStoreOpeningHourInput[]) {
  const response = await fetch('/api/live-store-opening-hours', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, rows })
  });

  return parseJsonResponse(response);
}

export async function deleteLiveStoreOpeningHour(id: string) {
  const response = await fetch('/api/live-store-opening-hours', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });

  return parseJsonResponse(response);
}
