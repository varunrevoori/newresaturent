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

function normalizeOpeningHours(rows: Array<{ day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>) {
  const uniqueRows = new Map<number, { restaurant_id: string; day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>();

  rows.forEach((row) => {
    uniqueRows.set(row.day_of_week, {
      restaurant_id: '',
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time,
      close_time: row.is_closed ? null : row.close_time,
      is_closed: row.is_closed
    });
  });

  return Array.from(uniqueRows.values());
}

function buildRestaurantRow(source: Awaited<ReturnType<typeof fetchRestaurantBundle>>) {
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
    menu_json: source.restaurant.menu_json
  };
}

function buildOpeningHoursCompatRows(
  rows: Array<{ restaurant_id: string; day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>
) {
  return rows.map((row) => {
    if (!row.is_closed) {
      return row;
    }

    // Some target schemas reject NULL times even when is_closed is true.
    return {
      ...row,
      open_time: row.open_time ?? '00:00:00',
      close_time: row.close_time ?? '00:00:00'
    };
  });
}

function looksLikeClosedTimeCompatibilityIssue(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('null value') ||
    normalized.includes('not-null') ||
    normalized.includes('violates not-null') ||
    normalized.includes('open_time') ||
    normalized.includes('close_time')
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const restaurantId = typeof body?.id === 'string' ? body.id : '';

    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurant id' }, { status: 400 });
    }

    const source = await fetchRestaurantBundle(restaurantId);
    const secondDb = createSecondAdminClient();

    const restaurantUpsert = await secondDb.from('restaurants').upsert(buildRestaurantRow(source), { onConflict: 'id' });
    if (restaurantUpsert.error) {
      throw restaurantUpsert.error;
    }

    const openingRows = normalizeOpeningHours(
      source.openingHours.map((row) => ({
        day_of_week: row.day_of_week,
        open_time: row.is_closed ? null : row.open_time,
        close_time: row.is_closed ? null : row.close_time,
        is_closed: row.is_closed
      }))
    ).map((row) => ({ ...row, restaurant_id: source.restaurant.id }));

    if (openingRows.length) {
      const clearOpeningHours = await secondDb.from('restaurant_opening_hours').delete().eq('restaurant_id', source.restaurant.id);
      if (clearOpeningHours.error) {
        throw clearOpeningHours.error;
      }

      const insertOpeningHours = await secondDb
        .from('restaurant_opening_hours')
        .upsert(openingRows, { onConflict: 'restaurant_id,day_of_week' });

      if (insertOpeningHours.error) {
        const message = insertOpeningHours.error.message || String(insertOpeningHours.error);
        if (!looksLikeClosedTimeCompatibilityIssue(message)) {
          throw insertOpeningHours.error;
        }

        const compatRows = buildOpeningHoursCompatRows(openingRows);
        const compatInsert = await secondDb
          .from('restaurant_opening_hours')
          .upsert(compatRows, { onConflict: 'restaurant_id,day_of_week' });

        if (compatInsert.error) {
          throw compatInsert.error;
        }
      }
    }

    return NextResponse.json({
      status: 'synced',
      restaurantId: source.restaurant.id,
      openingHours: openingRows.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync opening hours'
      },
      { status: 500 }
    );
  }
}