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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const restaurantId = typeof body?.id === 'string' ? body.id : '';

    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurant id' }, { status: 400 });
    }

    const source = await fetchRestaurantBundle(restaurantId);
    const secondDb = createSecondAdminClient();

    const openingRows = source.openingHours.map((row) => ({
      restaurant_id: source.restaurant.id,
      day_of_week: row.day_of_week,
      open_time: row.open_time,
      close_time: row.close_time,
      is_closed: row.is_closed
    }));

    if (openingRows.length) {
      const upsertOpeningHours = await secondDb
        .from('restaurant_opening_hours')
        .upsert(openingRows, { onConflict: 'restaurant_id,day_of_week' });

      if (upsertOpeningHours.error) {
        throw upsertOpeningHours.error;
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