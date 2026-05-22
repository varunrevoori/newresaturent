import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchRestaurantBundle } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';

type SourceReview = Awaited<ReturnType<typeof fetchRestaurantBundle>>['reviews'][number];

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
  const uniqueRows = new Map<number, { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>();

  rows.forEach((row) => {
    uniqueRows.set(row.day_of_week, {
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time,
      close_time: row.is_closed ? null : row.close_time,
      is_closed: row.is_closed
    });
  });

  return Array.from(uniqueRows.values());
}

function toRatingValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed.toFixed(1)) : null;
}

function buildSecondDatabaseReviewRows(restaurantId: string, reviews: SourceReview[]) {
  const copiedReviews = reviews;

  const rows = copiedReviews.map((review) => {
    const rating = toRatingValue(review.rating) ?? 0;

    return {
      id: review.id,
      restaurant_id: restaurantId,
      user_id: review.user_id,
      rating,
      review_text: review.review_text,
      liked_tags: review.liked_tags ?? [],
      photo_urls: review.photo_urls ?? [],
      username_snapshot: review.username_snapshot,
      avatar_snapshot: review.avatar_snapshot,
      is_approved: review.is_approved,
      created_at: review.created_at,
      updated_at: review.updated_at,
      food_rating: toRatingValue(review.food_rating) ?? rating,
      service_rating: toRatingValue(review.service_rating) ?? rating,
      ambience_rating: toRatingValue(review.ambience_rating) ?? rating,
      drinks_rating: toRatingValue(review.drinks_rating) ?? rating,
      crowd_rating: toRatingValue(review.crowd_rating) ?? rating,
      owner_reply_text: review.owner_reply_text,
      owner_reply_by: review.owner_reply_by,
      owner_reply_at: review.owner_reply_at,
      owner_reply_updated_at: review.owner_reply_updated_at
    };
  });

  const totalRating = rows.reduce((sum, review) => sum + review.rating, 0);
  const reviewCount = rows.length;
  const averageRating = reviewCount ? Number((totalRating / reviewCount).toFixed(1)) : null;

  return {
    rows,
    reviewCount,
    averageRating
  };
}

async function syncReviewsWithFallback(
  secondDb: ReturnType<typeof createSecondAdminClient>,
  restaurantId: string,
  rows: ReturnType<typeof buildSecondDatabaseReviewRows>['rows']
) {
  const output = {
    inserted: 0,
    failed: 0,
    errors: [] as string[]
  };

  const clearReviews = await secondDb.from('restaurant_reviews').delete().eq('restaurant_id', restaurantId);
  if (clearReviews.error) {
    output.errors.push(clearReviews.error.message || String(clearReviews.error));
    return output;
  }

  if (!rows.length) {
    return output;
  }

  const bulkInsert = await secondDb.from('restaurant_reviews').insert(rows);
  if (!bulkInsert.error) {
    output.inserted = rows.length;
    return output;
  }

  output.errors.push(bulkInsert.error.message || String(bulkInsert.error));

  function isUserForeignKeyError(message: string) {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('restaurant_reviews_user_id_fkey') ||
      normalized.includes('foreign key') ||
      normalized.includes('user_id') ||
      normalized.includes('not-null') ||
      normalized.includes('null value')
    );
  }

  async function getMirrorFallbackUserId() {
    const email = `mirror-review+${restaurantId}@local.invalid`;

    const created = await secondDb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        role: 'mirror_review_user'
      }
    });

    if (!created.error && created.data.user?.id) {
      return created.data.user.id;
    }

    const listed = await secondDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (listed.error) {
      return null;
    }

    const existingUser = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    return existingUser?.id ?? null;
  }

  let mirrorFallbackUserId: string | null = null;

  // Fallback to per-row upsert so one bad row does not block all valid reviews.
  for (const row of rows) {
    let singleInsert = await secondDb
      .from('restaurant_reviews')
      .upsert({ ...row, user_id: row.user_id ?? mirrorFallbackUserId }, { onConflict: 'id' });

    if (singleInsert.error && isUserForeignKeyError(singleInsert.error.message || String(singleInsert.error))) {
      if (!mirrorFallbackUserId) {
        mirrorFallbackUserId = await getMirrorFallbackUserId();
      }

      if (mirrorFallbackUserId) {
        singleInsert = await secondDb
          .from('restaurant_reviews')
          .upsert({ ...row, user_id: mirrorFallbackUserId }, { onConflict: 'id' });
      }
    }

    if (singleInsert.error) {
      output.failed += 1;
      const message = singleInsert.error.message || String(singleInsert.error);
      output.errors.push(`${row.id}: ${message}`);
    } else {
      output.inserted += 1;
    }
  }

  return output;
}

async function syncSecondDatabase(restaurantId: string) {
  const source = await fetchRestaurantBundle(restaurantId);
  const secondDb = createSecondAdminClient();
  const reviewSync = buildSecondDatabaseReviewRows(source.restaurant.id, source.reviews);

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
    // Prefer AI-generated summary as the external description when available
    description: source.restaurant.ai_summary ,
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

  const result: Record<string, any> = { restaurantId: source.restaurant.id, restaurantName: source.restaurant.name };

  try {
    const restaurantUpsert = await secondDb.from('restaurants').upsert(restaurantRow, { onConflict: 'id' });
    if (restaurantUpsert.error) {
      result.restaurantUpsertError = restaurantUpsert.error.message || String(restaurantUpsert.error);
    } else {
      result.restaurantUpsert = true;
    }
  } catch (err) {
    result.restaurantUpsertError = err instanceof Error ? err.message : String(err);
  }

  const openingRows = normalizeOpeningHours(
    source.openingHours.map((row) => ({
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time,
      close_time: row.is_closed ? null : row.close_time,
      is_closed: row.is_closed
    }))
  ).map((row) => ({ ...row, restaurant_id: source.restaurant.id }));

  const DEFAULT_BUCKET = 'gmap-scrapper-media-prod';

  const mediaRows = source.mediaAssets.map((row) => {
    const hasImage = Boolean(row.storage_public_url || row.file_url || row.local_file_path);
    const storage_bucket = row.storage_bucket ?? (hasImage ? null : DEFAULT_BUCKET);

    return {
      id: row.id,
      restaurant_id: source.restaurant.id,
      asset_type: row.asset_type,
      file_url: row.storage_public_url || row.file_url,
      file_path: row.file_path,
      sort_order: row.sort_order,
      is_active: row.is_active,
      storage_bucket,
      storage_path: row.storage_path ?? row.file_path,
      storage_public_url: row.storage_public_url ?? null
    };
  });

  const mediaRowsCompat = mediaRows.map((row) => ({
    id: row.id,
    restaurant_id: row.restaurant_id,
    asset_type: row.asset_type,
    file_url: row.file_url,
    file_path: row.file_path,
    sort_order: row.sort_order,
    is_active: row.is_active
  }));

  const tagRows = source.tags.map((row) => ({
    id: row.id,
    restaurant_id: source.restaurant.id,
    tag_type: row.tag_type,
    tag_value: row.tag_value,
    sort_order: row.sort_order
  }));

  if (openingRows.length) {
    try {
      const clearOpeningHours = await secondDb.from('restaurant_opening_hours').delete().eq('restaurant_id', source.restaurant.id);
      if (clearOpeningHours.error) {
        result.openingHoursDeleteError = clearOpeningHours.error.message || String(clearOpeningHours.error);
        result.openingHours = 0;
      } else {
        const insertOpeningHours = await secondDb
          .from('restaurant_opening_hours')
          .upsert(openingRows, { onConflict: 'restaurant_id,day_of_week' });
        if (insertOpeningHours.error) {
          result.openingHoursInsertError = insertOpeningHours.error.message || String(insertOpeningHours.error);
          result.openingHours = 0;
        } else {
          result.openingHours = openingRows.length;
        }
      }
    } catch (err) {
      result.openingHoursInsertError = err instanceof Error ? err.message : String(err);
      result.openingHours = 0;
    }
  } else {
    result.openingHours = 0;
  }

  try {
    const clearMediaAssets = await secondDb.from('restaurant_media_assets').delete().eq('restaurant_id', source.restaurant.id);
    if (clearMediaAssets.error) {
      result.clearMediaError = clearMediaAssets.error.message || String(clearMediaAssets.error);
    } else {
      result.clearedMedia = true;
    }
  } catch (err) {
    result.clearMediaError = err instanceof Error ? err.message : String(err);
  }

  if (mediaRows.length) {
    try {
      const insertMediaAssets = await secondDb.from('restaurant_media_assets').insert(mediaRows);
      if (insertMediaAssets.error) {
        const primaryError = insertMediaAssets.error.message || String(insertMediaAssets.error);
        result.insertMediaError = primaryError;

        const needsCompatRetry = /column|does not exist|unknown|invalid input|schema/i.test(primaryError);
        if (needsCompatRetry) {
          const compatInsert = await secondDb.from('restaurant_media_assets').insert(mediaRowsCompat);
          if (compatInsert.error) {
            result.insertMediaCompatError = compatInsert.error.message || String(compatInsert.error);
            result.mediaAssets = 0;
          } else {
            result.mediaAssets = mediaRowsCompat.length;
            result.mediaAssetsCompat = true;
          }
        } else {
          result.mediaAssets = 0;
        }
      } else {
        result.mediaAssets = mediaRows.length;
      }
    } catch (err) {
      result.insertMediaError = err instanceof Error ? err.message : String(err);
      result.mediaAssets = 0;
    }
  } else {
    result.mediaAssets = 0;
  }

  try {
    const clearTags = await secondDb.from('restaurant_tags').delete().eq('restaurant_id', source.restaurant.id);
    if (clearTags.error) {
      result.clearTagsError = clearTags.error.message || String(clearTags.error);
    } else {
      result.clearedTags = true;
    }
  } catch (err) {
    result.clearTagsError = err instanceof Error ? err.message : String(err);
  }

  if (tagRows.length) {
    try {
      const insertTags = await secondDb.from('restaurant_tags').insert(tagRows);
      if (insertTags.error) {
        result.insertTagsError = insertTags.error.message || String(insertTags.error);
        result.tags = 0;
      } else {
        result.tags = tagRows.length;
      }
    } catch (err) {
      result.insertTagsError = err instanceof Error ? err.message : String(err);
      result.tags = 0;
    }
  } else {
    result.tags = 0;
  }

  try {
    const reviewInsertResult = await syncReviewsWithFallback(secondDb, source.restaurant.id, reviewSync.rows);
    result.reviews = reviewInsertResult.inserted;
    result.failedReviews = reviewInsertResult.failed;
    if (reviewInsertResult.errors.length) {
      result.insertReviewsError = reviewInsertResult.errors.join(' | ');
    }
  } catch (err) {
    result.insertReviewsError = err instanceof Error ? err.message : String(err);
    result.reviews = 0;
    result.failedReviews = reviewSync.rows.length;
  }

  result.skippedReviews = source.reviews.length - reviewSync.rows.length + (result.failedReviews ?? 0);

  if (reviewSync.averageRating !== null) {
    try {
      const ratingUpdate = await secondDb
        .from('restaurants')
        .update({ rating: reviewSync.averageRating, user_ratings_total: reviewSync.reviewCount })
        .eq('id', source.restaurant.id);

      if (ratingUpdate.error) {
        const message = ratingUpdate.error.message || String(ratingUpdate.error);
        const looksLikeMissingColumn = /column|does not exist|unknown/i.test(message);
        if (!looksLikeMissingColumn) {
          result.ratingUpdateError = message;
        }
      } else {
        result.ratingUpdated = true;
      }
    } catch (err) {
      result.ratingUpdateError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
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

    let syncResult: Record<string, unknown> | null = null;
    let syncError: string | null = null;

    try {
      syncResult = await syncSecondDatabase(restaurantId);
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
    }

    const { error } = await supabase.from('restaurants').update({ isapproved: true }).eq('id', restaurantId);
    if (error) {
      throw error;
    }

    const payload: any = { status: 'approved', message: 'Restaurant approved.' };
    if (syncResult) {
      payload.message = 'Approved and synced restaurant tables. Auth/public user creation is skipped for now.';
      Object.assign(payload, syncResult);
    }

    if (syncError) {
      payload.syncWarning = syncError;
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to approve restaurant'
      },
      { status: 500 }
    );
  }
}
