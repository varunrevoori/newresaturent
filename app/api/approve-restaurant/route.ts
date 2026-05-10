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

function normalizeEmailLocalPart(name: string) {
  const localPart = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '');
  if (!localPart) {
    throw new Error('Restaurant name cannot be converted into an email');
  }

  return `${localPart}@gmail.com`;
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

async function findAuthUserByEmail(authClient: ReturnType<typeof createSecondAdminClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await authClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw error;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }

    if (data.users.length < 100) {
      break;
    }
  }

  return null;
}

async function ensureSecondOwnerUser(authClient: ReturnType<typeof createSecondAdminClient>, restaurantName: string, phone: string | null, coverImage: string | null, fullAddress: string | null) {
  const email = normalizeEmailLocalPart(restaurantName);
  const existing = await findAuthUserByEmail(authClient, email);
  if (existing) {
    return existing;
  }

  const { data, error } = await authClient.auth.admin.createUser({
    email,
    password: 'Test@123',
    email_confirm: true,
    user_metadata: {
      full_name: restaurantName,
      business_name: restaurantName,
      phone,
      profile_image: coverImage,
      business_address: fullAddress
    }
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Failed to create second-project auth user');
  }

  return data.user;
}

async function ensureSecondPublicUser(authClient: ReturnType<typeof createSecondAdminClient>, userId: string, email: string, restaurantName: string, phone: string | null, coverImage: string | null, fullAddress: string | null) {
  const { error } = await authClient.from('users').upsert(
    {
      id: userId,
      full_name: restaurantName,
      email,
      phone,
      role: 'user',
      profile_image: coverImage,
      business_name: restaurantName,
      business_address: fullAddress,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw error;
  }
}

async function syncSecondDatabase(restaurantId: string) {
  const source = await fetchRestaurantBundle(restaurantId);
  const secondDb = createSecondAdminClient();
  const ownerUser = await ensureSecondOwnerUser(
    secondDb,
    source.restaurant.name,
    source.restaurant.phone,
    source.restaurant.cover_image,
    source.restaurant.full_address
  );

  await ensureSecondPublicUser(
    secondDb,
    ownerUser.id,
    ownerUser.email ?? normalizeEmailLocalPart(source.restaurant.name),
    source.restaurant.name,
    source.restaurant.phone,
    source.restaurant.cover_image,
    source.restaurant.full_address
  );

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
    owner_user_id: ownerUser.id,
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
    on_boarded: true
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

  const reviewUserCache = new Map<string, boolean>();
  const reviewRows: Array<Record<string, unknown>> = [];

  for (const row of source.reviews) {
    let hasUser = reviewUserCache.get(row.user_id);

    if (hasUser === undefined) {
      const { data, error } = await secondDb.auth.admin.getUserById(row.user_id);
      if (error || !data.user) {
        reviewUserCache.set(row.user_id, false);
        continue;
      }

      hasUser = true;
      reviewUserCache.set(row.user_id, true);
    }

    if (!hasUser) {
      continue;
    }

    let ownerReplyBy: string | null = row.owner_reply_by;
    if (ownerReplyBy) {
      const cachedOwnerReply = reviewUserCache.get(ownerReplyBy);
      if (cachedOwnerReply === false) {
        ownerReplyBy = null;
      } else if (cachedOwnerReply === undefined) {
        const { data, error } = await secondDb.auth.admin.getUserById(ownerReplyBy);
        if (error || !data.user) {
          reviewUserCache.set(ownerReplyBy, false);
          ownerReplyBy = null;
        } else {
          reviewUserCache.set(ownerReplyBy, true);
        }
      }
    }

    reviewRows.push({
      id: row.id,
      restaurant_id: source.restaurant.id,
      user_id: row.user_id,
      rating: row.rating,
      review_text: row.review_text,
      liked_tags: row.liked_tags,
      photo_urls: row.photo_urls,
      username_snapshot: row.username_snapshot,
      avatar_snapshot: row.avatar_snapshot,
      is_approved: row.is_approved,
      food_rating: row.food_rating,
      service_rating: row.service_rating,
      ambience_rating: row.ambience_rating,
      drinks_rating: row.drinks_rating,
      crowd_rating: row.crowd_rating,
      owner_reply_text: row.owner_reply_text,
      owner_reply_by: ownerReplyBy,
      owner_reply_at: row.owner_reply_at,
      owner_reply_updated_at: row.owner_reply_updated_at
    });
  }

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

  const clearReviews = await secondDb.from('restaurant_reviews').delete().eq('restaurant_id', source.restaurant.id);
  if (clearReviews.error) {
    throw clearReviews.error;
  }

  if (reviewRows.length) {
    const insertReviews = await secondDb.from('restaurant_reviews').insert(reviewRows);
    if (insertReviews.error) {
      throw insertReviews.error;
    }
  }

  return {
    restaurantId: source.restaurant.id,
    restaurantName: source.restaurant.name,
    ownerEmail: ownerUser.email ?? normalizeEmailLocalPart(source.restaurant.name),
    openingHours: openingRows.length,
    mediaAssets: mediaRows.length,
    reviews: reviewRows.length,
    skippedReviews: source.reviews.length - reviewRows.length
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
      message:
        syncResult.skippedReviews > 0
          ? `Approved and synced. ${syncResult.skippedReviews} review(s) were skipped because the matching second-project auth users do not exist yet.`
          : 'Approved and synced to the second database.'
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
