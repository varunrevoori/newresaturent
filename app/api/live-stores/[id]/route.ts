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

const liveStoreSelect = `
  id, name, slug, description, category, subcategory, location_name, address_line1, address_line2,
  city, region, country, postal_code, full_address, lat, lng, google_place_id, logo_url, cover_image,
  phone, whatsapp, email, website, is_active, is_featured, is_top_brand, sort_order, store_type,
  merchant_type, on_boarded, created_at, updated_at
`;

const editableFields = new Set([
  'name',
  'slug',
  'description',
  'category',
  'subcategory',
  'location_name',
  'address_line1',
  'address_line2',
  'city',
  'region',
  'country',
  'postal_code',
  'full_address',
  'lat',
  'lng',
  'google_place_id',
  'cover_image',
  'logo_url',
  'phone',
  'whatsapp',
  'email',
  'website',
  'is_active',
  'is_featured',
  'is_top_brand',
  'sort_order'
]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const storeId = params.id;
    const secondDb = createSecondAdminClient();

    const [storeResult, hoursResult, mediaResult, tagsResult, offersResult, socialsResult, catalogueCountResult] = await Promise.all([
      secondDb.from('stores').select(liveStoreSelect).eq('id', storeId).single(),
      secondDb.from('store_opening_hours').select('*').eq('store_id', storeId).order('day_of_week', { ascending: true }),
      secondDb.from('store_media_assets').select('*').eq('store_id', storeId).order('sort_order', { ascending: true }),
      secondDb.from('store_tags').select('*').eq('store_id', storeId),
      secondDb.from('store_offers').select('*').eq('store_id', storeId),
      secondDb.from('store_social_links').select('*').eq('store_id', storeId).order('sort_order', { ascending: true }),
      secondDb.from('store_catalogue_items').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
    ]);

    if (storeResult.error) throw storeResult.error;

    return NextResponse.json({
      store: storeResult.data,
      openingHours: hoursResult.data ?? [],
      mediaAssets: mediaResult.data ?? [],
      tags: tagsResult.data ?? [],
      offers: offersResult.data ?? [],
      socialLinks: socialsResult.data ?? [],
      catalogueItemCount: catalogueCountResult.count ?? 0
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load live store'
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const storeId = params.id;
    const body = await request.json();
    const changes = body?.changes && typeof body.changes === 'object' ? body.changes : null;

    if (!changes || Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing store changes' }, { status: 400 });
    }

    const payload = Object.fromEntries(Object.entries(changes).filter(([key]) => editableFields.has(key)));

    if (!Object.keys(payload).length) {
      return NextResponse.json({ error: 'No editable fields in request' }, { status: 400 });
    }

    const secondDb = createSecondAdminClient();
    const { error } = await secondDb.from('stores').update(payload).eq('id', storeId);

    if (error) {
      const details = 'details' in error && error.details ? `: ${error.details}` : '';
      throw new Error((error.message || String(error)) + details);
    }

    return NextResponse.json({ status: 'updated', storeId, changes: payload });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update live store'
      },
      { status: 500 }
    );
  }
}
