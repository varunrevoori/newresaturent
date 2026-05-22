import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  }

  return value.replace(/\/rest\/v1\/?$/, '');
}

function createAdminClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY_SECOND;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bucket = typeof body?.bucket === 'string' ? body.bucket : '';

    if (!bucket) {
      return NextResponse.json({ error: 'Missing bucket name' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Try to create bucket; if it exists, createBucket returns an error we can ignore.
    const { data, error } = await admin.storage.createBucket(bucket, { public: true });
    if (error) {
      // If bucket already exists, return success
      const msg = (error as Error).message || String(error);
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('bucket already exists')) {
        return NextResponse.json({ status: 'exists' });
      }

      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ status: 'created', bucket: data?.name ?? bucket });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create bucket' }, { status: 500 });
  }
}
