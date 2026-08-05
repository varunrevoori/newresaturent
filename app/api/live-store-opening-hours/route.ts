import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

function normalizeRow(row: { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }) {
  if (!row.is_closed) {
    return row;
  }

  return { ...row, open_time: null, close_time: null };
}

// Create or update one or more opening-hour rows for a live (production) store.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const storeId = typeof body?.storeId === 'string' ? body.storeId : '';
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!storeId) {
      return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
    }

    if (!rows.length) {
      return NextResponse.json({ error: 'Missing opening hour rows' }, { status: 400 });
    }

    const payload = rows.map((row: any) =>
      normalizeRow({
        day_of_week: Number(row.day_of_week),
        open_time: row.open_time ?? null,
        close_time: row.close_time ?? null,
        is_closed: Boolean(row.is_closed)
      })
    ).map((row: ReturnType<typeof normalizeRow>) => ({ ...row, store_id: storeId }));

    const secondDb = createSecondAdminClient();
    const { data, error } = await secondDb.from('store_opening_hours').upsert(payload, { onConflict: 'store_id,day_of_week' }).select('*');

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: 'saved', rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to save opening hours'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';

    if (!id) {
      return NextResponse.json({ error: 'Missing opening hour id' }, { status: 400 });
    }

    const secondDb = createSecondAdminClient();
    const { error } = await secondDb.from('store_opening_hours').delete().eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delete opening hour'
      },
      { status: 500 }
    );
  }
}
