import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

const liveStoreSelect = `
  id, name, slug, description, category, subcategory, location_name, address_line1, address_line2,
  city, region, country, postal_code, full_address, lat, lng, google_place_id, logo_url, cover_image,
  phone, whatsapp, email, website, is_active, is_featured, is_top_brand, sort_order, store_type,
  merchant_type, on_boarded, created_at, updated_at
`;

// Reads the real, already-live stores from the second (production) database ---
// the same rows PassPrivé customers see on /stores. This is separate from the
// scraped-and-pending queue in the primary DB.
export async function GET() {
  try {
    const secondDb = createSecondAdminClient();
    const { data, error } = await secondDb.from('stores').select(liveStoreSelect).order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ stores: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load live stores'
      },
      { status: 500 }
    );
  }
}
