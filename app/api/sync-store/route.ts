import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { fetchStoreBundle } from '@/lib/store-dashboard';

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL_second is missing');
  }

  return value.replace(/\/rest\/v1\/?$/, '');
}

function createSecondAdminClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL_second);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY_second ?? process.env.SUPABASE_SERVICE_ROLE_KEY_SECOND;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_second is missing');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// The second DB's `stores` table is the production/commerce schema (merchant,
// payments, gifting, pickup, etc). The primary `stores` table only carries the
// scraped storefront fields. New rows get sane production defaults for the
// commerce-only columns; existing rows only ever have the overlapping fields
// below touched so we never clobber merchant configuration set elsewhere.
async function buildFullStoreRow(storeId: string) {
  const source = await fetchStoreBundle(storeId);
  const store = source.store;

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    category: store.category,
    subcategory: store.subcategory,
    phone: store.phone,
    address_line1: store.street_address,
    city: store.city,
    region: store.area,
    country: store.country,
    full_address: store.full_address,
    lat: store.latitude,
    lng: store.longitude,
    google_place_id: store.google_place_id,
    cover_image: store.cover_image,
    owner_user_id: null,
    created_by: null,
    is_active: store.is_active,
    is_featured: false,
    is_top_brand: false,
    sort_order: 0,
    store_type: 'PRODUCT',
    booking_enabled: false,
    advance_booking_days: 30,
    avg_duration_minutes: 60,
    modification_available: false,
    cancellation_available: false,
    cover_charge_enabled: false,
    booking_terms: [],
    pickup_basic_enabled: true,
    pickup_mode: 'BASIC',
    supports_time_slots: false,
    slot_duration_minutes: 30,
    slot_buffer_minutes: 0,
    slot_advance_days: 30,
    is_advertised: false,
    gifting_enabled: false,
    gifting_discount_percentage: 0,
    merchant_type: 'Unclaimed',
    on_boarded: false,
    merchant_plan: 'free',
    service_level: 'discoverable',
    booking_service_type: 'instant',
    pay_bill_enabled: false
  };
}

function buildMirrorPayload(changes: Record<string, unknown>) {
  const directKeys = new Set(['name', 'slug', 'description', 'category', 'subcategory', 'phone', 'city', 'country', 'full_address', 'google_place_id', 'cover_image', 'is_active']);

  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;

    if (directKeys.has(key)) {
      payload[key] = value;
      continue;
    }

    if (key === 'street_address' && value !== null) {
      payload.address_line1 = value;
    } else if (key === 'area' && value !== null) {
      payload.region = value;
    } else if (key === 'latitude' && value !== null) {
      payload.lat = value;
    } else if (key === 'longitude' && value !== null) {
      payload.lng = value;
    }
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const storeId = typeof body?.id === 'string' ? body.id : '';
    const changes = body?.changes && typeof body.changes === 'object' ? body.changes : null;

    if (!storeId) {
      return NextResponse.json({ error: 'Missing store id' }, { status: 400 });
    }

    if (!changes || Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing store changes' }, { status: 400 });
    }

    const secondDb = createSecondAdminClient();
    const payload = buildMirrorPayload(changes as Record<string, unknown>);

    const existingStore = await secondDb.from('stores').select('id').eq('id', storeId).maybeSingle();
    if (existingStore.error) {
      throw new Error(existingStore.error.message || String(existingStore.error));
    }

    if (existingStore.data) {
      const storeUpdate = await secondDb.from('stores').update(payload).eq('id', storeId);
      if (storeUpdate.error) {
        const details = 'details' in storeUpdate.error && storeUpdate.error.details ? `: ${storeUpdate.error.details}` : '';
        throw new Error((storeUpdate.error.message || String(storeUpdate.error)) + details);
      }
    } else {
      const fullRow = await buildFullStoreRow(storeId);
      const storeInsert = await secondDb.from('stores').insert(fullRow);
      if (storeInsert.error) {
        const details = 'details' in storeInsert.error && storeInsert.error.details ? `: ${storeInsert.error.details}` : '';
        throw new Error((storeInsert.error.message || String(storeInsert.error)) + details);
      }
    }

    return NextResponse.json({
      status: 'synced',
      storeId,
      changes: payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync store mirror'
      },
      { status: 500 }
    );
  }
}
