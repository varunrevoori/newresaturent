import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchRestaurantBundle } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';

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

async function syncSecondDatabase(restaurantId: string) {
  const source = await fetchRestaurantBundle(restaurantId);
  const secondDb = createSecondAdminClient();

  const restaurantRow = {
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
    description: source.restaurant.description,
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
    on_boarded: false,
    created_creds: false
  };

  const restaurantUpsert = await secondDb.from('restaurants').upsert(restaurantRow, { onConflict: 'id' });
  if (restaurantUpsert.error) {
    throw restaurantUpsert.error;
  }

  const openingRows = source.openingHours.map((row) => ({
    id: row.id,
    restaurant_id: source.restaurant.id,
    day_of_week: row.day_of_week,
    open_time: row.open_time,
    close_time: row.close_time,
    is_closed: row.is_closed
  }));

  const mediaRows = source.mediaAssets.map((row) => ({
    id: row.id,
    restaurant_id: source.restaurant.id,
    asset_type: row.asset_type,
    file_url: row.storage_public_url || row.file_url,
    file_path: row.file_path,
    sort_order: row.sort_order,
    is_active: row.is_active
  }));

  const clearOpeningHours = await secondDb.from('restaurant_opening_hours').delete().eq('restaurant_id', source.restaurant.id);
  if (clearOpeningHours.error) {
    throw clearOpeningHours.error;
  }

  if (openingRows.length) {
    const insertOpeningHours = await secondDb.from('restaurant_opening_hours').insert(openingRows);
    if (insertOpeningHours.error) {
      throw insertOpeningHours.error;
    }
  }

  const clearMediaAssets = await secondDb.from('restaurant_media_assets').delete().eq('restaurant_id', source.restaurant.id);
  if (clearMediaAssets.error) {
    throw clearMediaAssets.error;
  }

  if (mediaRows.length) {
    const insertMediaAssets = await secondDb.from('restaurant_media_assets').insert(mediaRows);
    if (insertMediaAssets.error) {
      throw insertMediaAssets.error;
    }
  }

  return {
    restaurantId: source.restaurant.id,
    restaurantName: source.restaurant.name,
    openingHours: openingRows.length,
    mediaAssets: mediaRows.length,
    reviews: 0,
    skippedReviews: source.reviews.length
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const restaurantId = typeof body?.id === 'string' ? body.id : '';
    const isapproved = Boolean(body?.isapproved);

    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurant id' }, { status: 400 });
    }

    if (!isapproved) {
      const { error } = await supabase.from('restaurants').update({ isapproved: false }).eq('id', restaurantId);
      if (error) {
        throw error;
      }

      return NextResponse.json({ status: 'updated', approved: false });
    }

    const syncResult = await syncSecondDatabase(restaurantId);

    const { error } = await supabase.from('restaurants').update({ isapproved: true }).eq('id', restaurantId);
    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: 'approved',
      ...syncResult,
      message: 'Approved and synced restaurant tables. Auth/public user creation is skipped for now.'
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to approve restaurant'
      },
      { status: 500 }
    );
  }
}
