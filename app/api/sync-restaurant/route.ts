import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { fetchRestaurantBundle } from '@/lib/dashboard';

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

async function buildFullRestaurantRow(restaurantId: string) {
  const source = await fetchRestaurantBundle(restaurantId);

  return {
    id: source.restaurant.id,
    name: source.restaurant.name,
    phone: source.restaurant.phone,
    area: source.restaurant.area,
    city: source.restaurant.city,
    full_address: source.restaurant.full_address,
    slug: source.restaurant.slug,
    cover_image: source.restaurant.cover_image,
    latitude: source.restaurant.latitude,
    longitude: source.restaurant.longitude,
    description: source.restaurant.ai_summary,
    cost_for_two: source.restaurant.cost_for_two,
    is_active: source.restaurant.is_active,
    owner_user_id: null,
    is_pure_veg: source.restaurant.is_pure_veg,
    booking_enabled: source.restaurant.booking_enabled,
    avg_duration_minutes: source.restaurant.avg_duration_minutes,
    max_bookings_per_slot: source.restaurant.max_bookings_per_slot,
    advance_booking_days: source.restaurant.advance_booking_days,
    modification_available: source.restaurant.modification_available,
    modification_cutoff_minutes: source.restaurant.modification_cutoff_minutes,
    cancellation_available: source.restaurant.cancellation_available,
    cancellation_cutoff_minutes: source.restaurant.cancellation_cutoff_minutes,
    cover_charge_enabled: source.restaurant.cover_charge_enabled,
    cover_charge_amount: source.restaurant.cover_charge_amount,
    is_advertised: source.restaurant.is_advertised,
    ad_priority: source.restaurant.ad_priority,
    ad_starts_at: source.restaurant.ad_starts_at,
    ad_ends_at: source.restaurant.ad_ends_at,
    ad_badge_text: source.restaurant.ad_badge_text,
    booking_terms: source.restaurant.booking_terms,
    menu_json: source.restaurant.menu_json,
  };
}

function buildMirrorPayload(changes: Record<string, unknown>) {
  const allowedKeys = new Set([
    'name',
    'phone',
    'area',
    'city',
    'full_address',
    'slug',
    'cover_image',
    'latitude',
    'longitude',
    'cost_for_two',
    'is_active',
    'owner_user_id',
    'is_pure_veg',
    'booking_enabled',
    'avg_duration_minutes',
    'max_bookings_per_slot',
    'advance_booking_days',
    'modification_available',
    'modification_cutoff_minutes',
    'cancellation_available',
    'cancellation_cutoff_minutes',
    'cover_charge_enabled',
    'cover_charge_amount',
    'is_advertised',
    'ad_priority',
    'ad_starts_at',
    'ad_ends_at',
    'ad_badge_text',
    'booking_terms',
    'menu_json'
  ]);

  const payload = Object.fromEntries(
    Object.entries(changes)
      .filter(([key, value]) => allowedKeys.has(key) && value !== undefined && value !== null)
  ) as Record<string, unknown>;

  delete payload.description;
  delete payload.ai_summary;
  delete payload.country;
  delete payload.google_place_id;
  delete payload.source;
  delete payload.source_payload;
  delete payload.last_synced_at;
  delete payload.rating;
  delete payload.user_ratings_total;
  delete payload.place_types;
  delete payload.isapproved;
  delete payload.on_boarded;
  delete payload.created_creds;

  if ('ai_summary' in changes && changes.ai_summary !== undefined && changes.ai_summary !== null) {
    payload.description = changes.ai_summary;
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const restaurantId = typeof body?.id === 'string' ? body.id : '';
    const changes = body?.changes && typeof body.changes === 'object' ? body.changes : null;

    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurant id' }, { status: 400 });
    }

    if (!changes || Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing restaurant changes' }, { status: 400 });
    }

    const secondDb = createSecondAdminClient();
    const payload = buildMirrorPayload(changes as Record<string, unknown>);

    const existingRestaurant = await secondDb.from('restaurants').select('id').eq('id', restaurantId).maybeSingle();
    if (existingRestaurant.error) {
      const message = existingRestaurant.error.message || String(existingRestaurant.error);
      throw new Error(message);
    }

    if (existingRestaurant.data) {
      const restaurantUpdate = await secondDb.from('restaurants').update(payload).eq('id', restaurantId);
      if (restaurantUpdate.error) {
        const message = restaurantUpdate.error.message || String(restaurantUpdate.error);
        const details = 'details' in restaurantUpdate.error && restaurantUpdate.error.details ? `: ${restaurantUpdate.error.details}` : '';
        throw new Error(message + details);
      }
    } else {
      const fullRow = await buildFullRestaurantRow(restaurantId);
      const restaurantInsert = await secondDb.from('restaurants').insert(fullRow);
      if (restaurantInsert.error) {
        const message = restaurantInsert.error.message || String(restaurantInsert.error);
        const details = 'details' in restaurantInsert.error && restaurantInsert.error.details ? `: ${restaurantInsert.error.details}` : '';
        throw new Error(message + details);
      }
    }

    return NextResponse.json({
      status: 'synced',
      restaurantId,
      changes: payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync restaurant mirror'
      },
      { status: 500 }
    );
  }
}