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

function normalizeOpeningHours(rows: Array<{ day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>) {
  const uniqueRows = new Map<number, { store_id: string; day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>();

  rows.forEach((row) => {
    uniqueRows.set(row.day_of_week, {
      store_id: '',
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time,
      close_time: row.is_closed ? null : row.close_time,
      is_closed: row.is_closed
    });
  });

  return Array.from(uniqueRows.values());
}

function buildOpeningHoursCompatRows(rows: Array<{ store_id: string; day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }>) {
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
    const storeId = typeof body?.id === 'string' ? body.id : '';

    if (!storeId) {
      return NextResponse.json({ error: 'Missing store id' }, { status: 400 });
    }

    const source = await fetchStoreBundle(storeId);
    const secondDb = createSecondAdminClient();

    const existingStore = await secondDb.from('stores').select('id').eq('id', storeId).maybeSingle();
    if (existingStore.error) {
      throw existingStore.error;
    }

    if (!existingStore.data) {
      return NextResponse.json({
        status: 'skipped',
        storeId,
        reason: 'Store is not synced to the second database yet. Approve it first.'
      });
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
      const clearOpeningHours = await secondDb.from('store_opening_hours').delete().eq('store_id', source.store.id);
      if (clearOpeningHours.error) {
        throw clearOpeningHours.error;
      }

      const insertOpeningHours = await secondDb.from('store_opening_hours').upsert(openingRows, { onConflict: 'store_id,day_of_week' });

      if (insertOpeningHours.error) {
        const message = insertOpeningHours.error.message || String(insertOpeningHours.error);
        if (!looksLikeClosedTimeCompatibilityIssue(message)) {
          throw insertOpeningHours.error;
        }

        const compatRows = buildOpeningHoursCompatRows(openingRows);
        const compatInsert = await secondDb.from('store_opening_hours').upsert(compatRows, { onConflict: 'store_id,day_of_week' });

        if (compatInsert.error) {
          throw compatInsert.error;
        }
      }
    }

    return NextResponse.json({
      status: 'synced',
      storeId: source.store.id,
      openingHours: openingRows.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync store opening hours'
      },
      { status: 500 }
    );
  }
}
