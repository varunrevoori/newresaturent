import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchStoreBundle } from '@/lib/store-dashboard';
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

function buildOpeningHoursCompatRows(
  rows: Array<{ store_id: string; day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>
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

// The second DB's `stores` table is the richer production/commerce schema
// (merchant, payments, gifting, pickup, etc). We only ever write the fields
// that are actually sourced from the scraped primary `stores` row; every
// commerce-only column gets a safe production default on first insert and is
// left untouched on subsequent syncs.
async function buildSecondDatabaseStoreRow(store: Awaited<ReturnType<typeof fetchStoreBundle>>['store']) {
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

async function syncSecondDatabase(storeId: string) {
  const source = await fetchStoreBundle(storeId);
  const secondDb = createSecondAdminClient();
  const result: Record<string, any> = { storeId: source.store.id, storeName: source.store.name };

  try {
    const storeRow = await buildSecondDatabaseStoreRow(source.store);
    const storeUpsert = await secondDb.from('stores').upsert(storeRow, { onConflict: 'id' });
    if (storeUpsert.error) {
      result.storeUpsertError = storeUpsert.error.message || String(storeUpsert.error);
    } else {
      result.storeUpsert = true;
    }
  } catch (err) {
    result.storeUpsertError = err instanceof Error ? err.message : String(err);
  }

  const openingRows = normalizeOpeningHours(
    source.openingHours.map((row) => ({
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time,
      close_time: row.is_closed ? null : row.close_time,
      is_closed: row.is_closed
    }))
  ).map((row) => ({ ...row, store_id: source.store.id }));

  if (openingRows.length) {
    try {
      const clearOpeningHours = await secondDb.from('store_opening_hours').delete().eq('store_id', source.store.id);
      if (clearOpeningHours.error) {
        result.openingHoursDeleteError = clearOpeningHours.error.message || String(clearOpeningHours.error);
        result.openingHours = 0;
      } else {
        const insertOpeningHours = await secondDb.from('store_opening_hours').upsert(openingRows, { onConflict: 'store_id,day_of_week' });
        if (insertOpeningHours.error) {
          const message = insertOpeningHours.error.message || String(insertOpeningHours.error);
          if (!looksLikeClosedTimeCompatibilityIssue(message)) {
            result.openingHoursInsertError = message;
            result.openingHours = 0;
          } else {
            const compatRows = buildOpeningHoursCompatRows(openingRows);
            const compatInsert = await secondDb.from('store_opening_hours').upsert(compatRows, { onConflict: 'store_id,day_of_week' });

            if (compatInsert.error) {
              result.openingHoursInsertError = compatInsert.error.message || String(compatInsert.error);
              result.openingHours = 0;
            } else {
              result.openingHours = compatRows.length;
              result.openingHoursCompat = true;
            }
          }
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

  const mediaRows = source.mediaAssets.map((row) => ({
    id: row.id,
    store_id: source.store.id,
    asset_type: row.asset_type,
    file_url: row.storage_public_url || row.file_url,
    file_path: row.file_path,
    sort_order: row.sort_order,
    is_active: row.is_active
  }));

  try {
    const clearMediaAssets = await secondDb.from('store_media_assets').delete().eq('store_id', source.store.id);
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
      const insertMediaAssets = await secondDb.from('store_media_assets').insert(mediaRows);
      if (insertMediaAssets.error) {
        result.insertMediaError = insertMediaAssets.error.message || String(insertMediaAssets.error);
        result.mediaAssets = 0;
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

  const criticalSyncErrors = [result.storeUpsertError, result.openingHoursDeleteError, result.openingHoursInsertError].filter(Boolean);

  if (criticalSyncErrors.length) {
    throw new Error(`Second DB sync failed for required tables: ${criticalSyncErrors.join(' | ')}`);
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const storeId = typeof body?.id === 'string' ? body.id : '';
    const isapproved = Boolean(body?.isapproved);

    if (!storeId) {
      return NextResponse.json({ error: 'Missing store id' }, { status: 400 });
    }

    if (!isapproved) {
      const { error } = await supabase.from('stores').update({ isapproved: false }).eq('id', storeId);
      if (error) {
        throw error;
      }

      return NextResponse.json({ status: 'updated', approved: false });
    }

    const syncResult = await syncSecondDatabase(storeId);

    const { error } = await supabase.from('stores').update({ isapproved: true }).eq('id', storeId);
    if (error) {
      throw error;
    }

    const payload: any = { status: 'approved', message: 'Store approved.' };
    if (syncResult) {
      payload.message = 'Approved and synced store tables.';
      Object.assign(payload, syncResult);
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to approve store'
      },
      { status: 500 }
    );
  }
}
