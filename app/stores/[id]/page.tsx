'use client';

import Link from 'next/link';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  approveStore,
  createStoreMediaAsset,
  saveStoreMediaAsset,
  createStoreOpeningHour,
  deleteStoreMediaAsset,
  deleteStoreOpeningHour,
  fetchStoreBundle,
  saveStoreOpeningHour,
  saveStoreTags,
  StoreBundle,
  syncStoreMirror,
  updateStore,
} from '@/lib/store-dashboard';
import { supabase } from '@/lib/supabase';

type AssetType = 'logo' | 'cover' | 'gallery';

// Mirrors the production `store_mood_categories` table (the canonical
// top-level categories used across the storefront). `stores.category` stores
// one or more of these as a comma-separated string.
const storeCategoryOptions = [
  'All Stores',
  'Apparel',
  'Footwear',
  'Accessories',
  'Jewellery',
  'Beauty',
  'Home Furniture',
  'Salon & Wellness',
];

// `stores.subcategory` has no fixed taxonomy in production, just free text.
// These are the values already in use there, offered as autocomplete
// suggestions so new entries stay consistent instead of drifting.
const storeSubcategorySuggestions = [
  'Activewear',
  'Bags & Watches',
  'Casual & Street Fashion',
  'Clothing',
  'Cosmetics',
  'Crystal Jewellery',
  'Denim',
  'Fashion Jewellery',
  'Footwear',
  'Footwear & Bags',
  'Furniture & Electronics',
  'Furniture & Home Decor',
  'Hair Salon',
  'Home Decor',
  'Interior Furniture & Decor',
  "Men's Fashion",
  "Men's Wear",
  'Makeup & Skincare',
  'Shoes & Apparel',
  'Spa',
  'Streetwear',
  'Sunglasses & Eyewear',
  "Women's Fashion",
];

function categoryTagsFromValue(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function tagLinesFromText(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function tagTextFromBundle(tags: { tag_value: string }[] | undefined) {
  return (tags ?? []).map((tag) => tag.tag_value).join('\n');
}

type LocalMediaPreview = {
  id: string;
  assetType: AssetType;
  previewUrl: string;
  fileName: string;
  file: File;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isBucketNotFoundError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('bucket not found') || normalized.includes('not found');
}

function formValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function booleanValue(formData: FormData, name: string) {
  return formData.get(name) === 'on';
}

function nullableString(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseJsonText(value: string) {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  return JSON.parse(trimmed);
}

function arrayFromText(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function textFromArray(value: string[] | null | undefined) {
  return (value ?? []).join(', ');
}

function buildStoreUpdate(formData: FormData) {
  const name = formValue(formData.get('name')).trim();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  const payload = {
    name,
    phone: nullableString(formData.get('phone')),
    area: nullableString(formData.get('area')),
    city: nullableString(formData.get('city')),
    street_address: nullableString(formData.get('street_address')),
    full_address: nullableString(formData.get('full_address')),
    slug,
    latitude: nullableNumber(formData.get('latitude')),
    longitude: nullableNumber(formData.get('longitude')),
    description: nullableString(formData.get('description')),
    is_active: booleanValue(formData, 'is_active'),
    google_place_id: nullableString(formData.get('google_place_id')),
    source: nullableString(formData.get('source')),
    source_payload: parseJsonText(formValue(formData.get('source_payload'))),
    rating: nullableNumber(formData.get('rating')),
    user_ratings_total: nullableNumber(formData.get('user_ratings_total')),
    place_types: arrayFromText(formValue(formData.get('place_types'))),
    country: nullableString(formData.get('country')),
    category: formData.getAll('category_tag').map(String).join(', ') || null,
    subcategory: nullableString(formData.get('subcategory')),
    isapproved: booleanValue(formData, 'isapproved'),
  };

  if (formData.has('cover_image')) {
    return {
      ...payload,
      cover_image: nullableString(formData.get('cover_image')),
    };
  }

  return payload;
}

function buildOpeningHourPayload(formData: FormData) {
  const isClosed = booleanValue(formData, 'is_closed');
  const openTime = nullableString(formData.get('open_time'));
  const closeTime = nullableString(formData.get('close_time'));
  const normalizedCloseTime = !isClosed && openTime && !closeTime ? '23:59' : closeTime;

  return {
    day_of_week: Number(formValue(formData.get('day_of_week'))),
    open_time: isClosed ? null : openTime,
    close_time: isClosed ? null : normalizedCloseTime,
    is_closed: isClosed,
  };
}

function buildOpeningHourPayloads(formData: FormData) {
  const payload = buildOpeningHourPayload(formData);
  if (payload.day_of_week !== 1) {
    return [payload];
  }

  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    ...payload,
    day_of_week: dayOfWeek,
  }));
}

function dayLabel(dayOfWeek: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function autofillClosingTime(event: ChangeEvent<HTMLInputElement>) {
  const form = event.currentTarget.form;
  if (!form) {
    return;
  }

  const openTime = form.elements.namedItem('open_time');
  const closeTime = form.elements.namedItem('close_time');
  const isClosed = form.elements.namedItem('is_closed');

  if (
    !(openTime instanceof HTMLInputElement) ||
    !(closeTime instanceof HTMLInputElement) ||
    !(isClosed instanceof HTMLInputElement) ||
    isClosed.checked ||
    !event.currentTarget.value ||
    closeTime.value
  ) {
    return;
  }

  closeTime.value = '23:59';
}

export default function StoreDetailsPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const [bundle, setBundle] = useState<StoreBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [localMediaPreviews, setLocalMediaPreviews] = useState<LocalMediaPreview[]>([]);
  const localPreviewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    localPreviewUrlsRef.current = localMediaPreviews.map((item) => item.previewUrl);
  }, [localMediaPreviews]);

  useEffect(() => {
    return () => {
      localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function loadBundle() {
    if (!storeId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchStoreBundle(storeId);
      setBundle(data);
      setVersion((current) => current + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load store bundle');
    } finally {
      setLoading(false);
    }
  }

  async function syncOpeningHours() {
    const response = await fetch('/api/sync-store-opening-hours', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: storeId }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? 'Failed to sync opening hours');
    }

    return payload;
  }

  async function republishIfApproved() {
    if (bundle?.store.isapproved !== true) {
      return;
    }

    await approveStore(storeId, true);
  }

  useEffect(() => {
    void loadBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (!storeId) {
    return (
      <main>
        <div className='error-box'>Missing store id.</div>
      </main>
    );
  }

  async function handleApproveChange(isapproved: boolean) {
    setSavingAction('approve');
    setNotice(null);

    try {
      const result = await approveStore(storeId, isapproved);
      await loadBundle();
      setNotice(result?.message ?? (isapproved ? 'Store approved.' : 'Store marked as pending again.'));
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Failed to update approval state');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleStoreSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction('store');
    setNotice(null);
    const formElement = event.currentTarget;

    try {
      const formData = new FormData(formElement);
      const payload = buildStoreUpdate(formData);
      if (!payload.name) {
        throw new Error('Store name is required');
      }

      await updateStore(storeId, payload);
      await syncStoreMirror(storeId, payload);
      const tagSaveResult = await saveStoreTags(storeId, tagLinesFromText(formValue(formData.get('tags'))));
      await republishIfApproved();
      await loadBundle();
      setNotice(tagSaveResult.warning ?? 'Store details saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save store');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleSetCoverImage(coverImageUrl: string) {
    setSavingAction('cover-image');
    setNotice(null);

    try {
      await updateStore(storeId, { cover_image: coverImageUrl });
      await syncStoreMirror(storeId, { cover_image: coverImageUrl });
      await republishIfApproved();
      await loadBundle();
      setNotice('Cover image updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update cover image');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleOpeningHourSave(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setSavingAction(`opening-${id}`);
    setNotice(null);

    try {
      await saveStoreOpeningHour(id, buildOpeningHourPayload(new FormData(event.currentTarget)));
      await loadBundle();
      try {
        await syncOpeningHours();
      } catch (syncError) {
        setNotice(syncError instanceof Error ? `Saved locally, but mirror sync failed: ${syncError.message}` : 'Saved locally, but mirror sync failed.');
        return;
      }
      setNotice('Opening hours updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save opening hours');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleOpeningHourAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction('opening-new');
    setNotice(null);

    try {
      const formElement = event.currentTarget;
      const payloads = buildOpeningHourPayloads(new FormData(formElement));
      for (const payload of payloads) {
        await createStoreOpeningHour(storeId, payload);
      }
      formElement.reset();
      await loadBundle();
      try {
        await syncOpeningHours();
      } catch (syncError) {
        setNotice(syncError instanceof Error ? `Saved locally, but mirror sync failed: ${syncError.message}` : 'Saved locally, but mirror sync failed.');
        return;
      }
      setNotice('New opening hour row added.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add opening hour');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleOpeningHourDelete(id: string) {
    if (!window.confirm('Delete this opening hour row?')) {
      return;
    }

    setSavingAction(`opening-delete-${id}`);
    setNotice(null);

    try {
      await deleteStoreOpeningHour(id);
      await loadBundle();
      try {
        await syncOpeningHours();
      } catch (syncError) {
        setNotice(syncError instanceof Error ? `Deleted locally, but mirror sync failed: ${syncError.message}` : 'Deleted locally, but mirror sync failed.');
        return;
      }
      setNotice('Opening hour row deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete opening hour');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleMediaAssetDelete(id: string) {
    if (!window.confirm('Delete this media asset?')) {
      return;
    }

    setSavingAction(`media-delete-${id}`);
    setNotice(null);

    try {
      await deleteStoreMediaAsset(id);
      await loadBundle();
      setNotice('Media asset deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete media asset');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleChangeAssetType(assetId: string, newType: AssetType) {
    setSavingAction('media-update');
    setNotice(null);
    try {
      await saveStoreMediaAsset(assetId, { asset_type: newType });
      await loadBundle();
      setNotice('Asset type updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update asset type');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleDuplicateAsset(asset: any, targetType: AssetType) {
    setSavingAction('media-duplicate');
    setNotice(null);
    try {
      await createStoreMediaAsset(storeId!, {
        asset_type: targetType,
        file_url: asset.file_url,
        file_path: asset.file_path,
        storage_public_url: asset.storage_public_url,
        storage_bucket: asset.storage_bucket,
        storage_path: asset.storage_path,
        mime_type: asset.mime_type,
        is_active: asset.is_active,
        sort_order: asset.sort_order,
      });

      await loadBundle();
      setNotice('Asset duplicated to target group.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to duplicate asset');
    } finally {
      setSavingAction(null);
    }
  }

  function mediaUrl(asset: { storage_public_url: string | null; file_url: string }) {
    return asset.storage_public_url || asset.file_url;
  }

  function handleLocalMediaFiles(assetType: AssetType, files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const nextPreviews: LocalMediaPreview[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }

      nextPreviews.push({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        assetType,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        file,
      });
    });

    if (nextPreviews.length > 0) {
      setLocalMediaPreviews((current) => [...current, ...nextPreviews]);
      setNotice('Local image preview updated.');
    }
  }

  function handleRemoveLocalPreview(id: string) {
    setLocalMediaPreviews((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
      }

      return current.filter((entry) => entry.id !== id);
    });
  }

  async function handleSaveLocalMediaChanges() {
    if (localMediaPreviews.length === 0) {
      setNotice('No local images to save.');
      return;
    }

    setSavingAction('media-save');
    setNotice(null);
    setError(null);

    try {
      const baseSort = (bundle?.mediaAssets.length ?? 0) + 1;
      const DEFAULT_BUCKET = 'gmap-scrapper-media-prod';
      const existingBuckets = Array.from(
        new Set((bundle?.mediaAssets ?? []).map((asset) => asset.storage_bucket).filter(Boolean)),
      ) as string[];
      const candidateBuckets = Array.from(
        new Set(
          [
            ...existingBuckets,
            process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET,
            DEFAULT_BUCKET,
            'store-media',
            'store_media',
            'media-assets',
            'media',
            'uploads',
          ].filter(Boolean),
        ),
      ) as string[];

      if (candidateBuckets.length === 0) {
        throw new Error('No storage bucket configured. Set NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET in .env.');
      }

      let resolvedBucket: string | null = null;

      async function bucketExists(bucketName: string) {
        try {
          const { error } = await supabase.storage.from(bucketName).list('', { limit: 1 });
          if (error) {
            return !isBucketNotFoundError(error.message);
          }

          return true;
        } catch (e) {
          return false;
        }
      }

      const availableBuckets: string[] = [];
      for (const b of candidateBuckets) {
        // eslint-disable-next-line no-await-in-loop
        if (await bucketExists(b)) availableBuckets.push(b);
      }

      if (availableBuckets.length === 0) {
        try {
          const res = await fetch('/api/create-bucket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bucket: DEFAULT_BUCKET }),
          });

          const payload = await res.json().catch(() => null);
          if (res.ok && (payload?.status === 'created' || payload?.status === 'exists')) {
            availableBuckets.push(DEFAULT_BUCKET);
          } else {
            throw new Error(payload?.error || 'Failed to create default bucket');
          }
        } catch (e) {
          throw new Error(
            e instanceof Error
              ? `No available storage buckets and failed to create default bucket: ${e.message}`
              : 'No available storage buckets',
          );
        }
      }

      for (let index = 0; index < localMediaPreviews.length; index += 1) {
        const preview = localMediaPreviews[index];
        let uploadBucket: string | null = resolvedBucket;
        let storagePath = '';
        let uploadErrorMessage = '';

        const tryBuckets: string[] = uploadBucket ? [uploadBucket] : availableBuckets;

        for (const bucket of tryBuckets) {
          storagePath = `${storeId}/${preview.assetType}/${Date.now()}-${index}-${sanitizeFileName(preview.fileName)}`;
          const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, preview.file, {
            upsert: false,
            contentType: preview.file.type || undefined,
          });

          if (!uploadError) {
            uploadBucket = bucket;
            resolvedBucket = bucket;
            uploadErrorMessage = '';
            break;
          }

          uploadErrorMessage = uploadError.message;
          if (!isBucketNotFoundError(uploadError.message)) {
            break;
          }
        }

        if (!uploadBucket || uploadErrorMessage) {
          throw new Error(`Upload failed for ${preview.fileName}: ${uploadErrorMessage || 'unknown upload error'}`);
        }

        const { data: publicData } = supabase.storage.from(uploadBucket).getPublicUrl(storagePath);
        const publicUrl = publicData.publicUrl;

        await createStoreMediaAsset(storeId, {
          asset_type: preview.assetType,
          file_url: publicUrl,
          sort_order: baseSort + index,
          is_active: true,
          local_file_path: preview.fileName,
          mime_type: preview.file.type || null,
          storage_bucket: uploadBucket,
          storage_path: storagePath,
          storage_public_url: publicUrl,
        });

        URL.revokeObjectURL(preview.previewUrl);
      }

      setLocalMediaPreviews([]);
      await loadBundle();
      setNotice(`Image changes saved.${resolvedBucket ? ` Uploaded to bucket: ${resolvedBucket}.` : ''}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to save images. Check storage bucket and insert permissions.',
      );
    } finally {
      setSavingAction(null);
    }
  }

  const store = bundle?.store;

  return (
    <main>
      <div className='shell'>
        <section className='hero'>
          <span className='kicker'>Store detail</span>
          <h1>{store?.name ?? 'Loading store...'}</h1>
          <p>
            Edit the store record, opening hours, and media assets from one screen. Approval changes are saved back
            to the same <strong>stores</strong> row.
          </p>

          <div className='topbar'>
            <div className='search-row'>
              <Link href='/' className='button-ghost'>
                Back to dashboard
              </Link>
              <button className='toggle' type='button' onClick={() => void loadBundle()}>
                Reload data
              </button>
            </div>
            <div className='search-row'>
              <span className={`status ${store?.isapproved === true ? 'status-approved' : 'status-pending'}`}>
                {store?.isapproved === true ? 'Approved' : 'Pending approval'}
              </span>
              <span className='count-pill'>{bundle?.openingHours.length ?? 0} opening rows</span>
              <span className='count-pill'>{bundle?.mediaAssets.length ?? 0} media assets</span>
            </div>
          </div>
        </section>

        {loading ? <div className='helper-box'>Loading store bundle...</div> : null}
        {error ? <div className='error-box'>{error}</div> : null}
        {notice ? <div className='success-box'>{notice}</div> : null}

        {store ? (
          <div className='section'>
            <section className='detail-card'>
              <div className='section-head'>
                <div>
                  <span className='kicker'>Store record</span>
                  <h2>Core details</h2>
                  <p>Everything below writes back to the main stores table.</p>
                </div>
                <div className='search-row'>
                  <button
                    className='button'
                    type='button'
                    onClick={() => void handleApproveChange(true)}
                    disabled={store.isapproved === true || savingAction === 'approve'}
                  >
                    {savingAction === 'approve' ? 'Saving...' : store.isapproved === true ? 'Approved' : 'Approve'}
                  </button>
                  <button
                    className='button-ghost'
                    type='button'
                    onClick={() => void handleApproveChange(false)}
                    disabled={store.isapproved === false || savingAction === 'approve'}
                  >
                    Mark pending
                  </button>
                </div>
              </div>

              <form key={version} className='section' onSubmit={handleStoreSave}>
                <div className='form-grid'>
                  <div className='field'>
                    <label htmlFor='name'>Name</label>
                    <input id='name' name='name' type='text' defaultValue={store.name} required />
                  </div>
                  <div className='field'>
                    <label htmlFor='slug'>Slug</label>
                    <input
                      id='slug'
                      name='slug'
                      type='text'
                      defaultValue={formValue(store.slug)}
                      disabled
                      title='Auto-generated from name'
                    />
                  </div>
                  <div className='field'>
                    <label htmlFor='phone'>Phone</label>
                    <input id='phone' name='phone' type='text' defaultValue={formValue(store.phone)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='subcategory'>Subcategory</label>
                    <input
                      id='subcategory'
                      name='subcategory'
                      type='text'
                      list='subcategory-suggestions'
                      defaultValue={formValue(store.subcategory)}
                      placeholder='e.g. Hair Salon, Denim, Fashion Jewellery'
                    />
                    <datalist id='subcategory-suggestions'>
                      {storeSubcategorySuggestions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                  <div className='field'>
                    <label htmlFor='country'>Country</label>
                    <input id='country' name='country' type='text' defaultValue={formValue(store.country)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='area'>Area</label>
                    <input id='area' name='area' type='text' defaultValue={formValue(store.area)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='city'>City</label>
                    <input id='city' name='city' type='text' defaultValue={formValue(store.city)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='street_address'>Street address</label>
                    <input id='street_address' name='street_address' type='text' defaultValue={formValue(store.street_address)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='full_address'>Full address</label>
                    <textarea id='full_address' name='full_address' defaultValue={formValue(store.full_address)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='latitude'>Latitude</label>
                    <input id='latitude' name='latitude' type='number' step='any' defaultValue={formValue(store.latitude)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='longitude'>Longitude</label>
                    <input id='longitude' name='longitude' type='number' step='any' defaultValue={formValue(store.longitude)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='google_place_id'>Google place id</label>
                    <input id='google_place_id' name='google_place_id' type='text' defaultValue={formValue(store.google_place_id)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='source'>Source</label>
                    <input id='source' name='source' type='text' defaultValue={formValue(store.source)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='rating'>Rating</label>
                    <input id='rating' name='rating' type='number' step='any' defaultValue={formValue(store.rating)} />
                  </div>
                  <div className='field'>
                    <label htmlFor='user_ratings_total'>User ratings total</label>
                    <input
                      id='user_ratings_total'
                      name='user_ratings_total'
                      type='number'
                      step='1'
                      defaultValue={formValue(store.user_ratings_total)}
                    />
                  </div>
                </div>

                <div className='field'>
                  <label htmlFor='category_tag'>Category</label>
                  <div className='helper' style={{ marginBottom: 8 }}>
                    Matches the production store_mood_categories taxonomy. Pick every category this store belongs to.
                  </div>
                  <div className='switch-row' style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    {storeCategoryOptions.map((option) => {
                      const checked = categoryTagsFromValue(store.category).some(
                        (tag) => tag.toLowerCase() === option.toLowerCase(),
                      );

                      return (
                        <label key={option} className='check' style={{ minWidth: 160 }}>
                          <input name='category_tag' type='checkbox' value={option} defaultChecked={checked} /> {option}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className='field'>
                  <label htmlFor='tags'>Tags</label>
                  <div className='helper' style={{ marginBottom: 8 }}>
                    Shown as bullet keywords under "About the brand" on the storefront (e.g. fashion, premium,
                    clothing). One per line or comma-separated.
                  </div>
                  <textarea
                    id='tags'
                    name='tags'
                    defaultValue={tagTextFromBundle(bundle?.tags)}
                    placeholder={'fashion\npremium\nclothing'}
                  />
                </div>

                <div className='field'>
                  <label htmlFor='description'>Description</label>
                  <textarea id='description' name='description' defaultValue={formValue(store.description)} />
                </div>

                <div className='field'>
                  <label>Cover image</label>
                  <div className='helper'>
                    Select from provided images in the Media Assets section using the "Set as cover" button.
                  </div>
                  {store.cover_image ? (
                    <img
                      src={store.cover_image}
                      alt='Current cover'
                      className='media-preview-image'
                      style={{ maxWidth: 280, marginTop: 10 }}
                    />
                  ) : (
                    <div className='helper-box'>No cover image selected yet.</div>
                  )}
                </div>

                <div className='field'>
                  <label htmlFor='place_types'>Place types</label>
                  <textarea id='place_types' name='place_types' defaultValue={textFromArray(store.place_types)} />
                </div>

                <div className='field'>
                  <label htmlFor='source_payload'>Source payload JSON</label>
                  <textarea id='source_payload' name='source_payload' defaultValue={jsonText(store.source_payload)} />
                </div>

                <div className='switch-row'>
                  <label className='check'>
                    <input name='is_active' type='checkbox' defaultChecked={store.is_active} /> Active
                  </label>
                  <label className='check'>
                    <input name='isapproved' type='checkbox' defaultChecked={store.isapproved === true} /> Approved
                  </label>
                </div>

                <div className='toolbar'>
                  <div className='helper'>Updated at {store.updated_at}</div>
                  <button className='button' type='submit' disabled={savingAction === 'store'}>
                    {savingAction === 'store' ? 'Saving...' : 'Save store'}
                  </button>
                </div>
              </form>
            </section>

            <section className='detail-card section'>
              <div className='section-head'>
                <div>
                  <span className='kicker'>Opening hours</span>
                  <h2>Schedule</h2>
                  <p>
                    Each row updates the store_opening_hours table. Fill open time and close time will default to
                    23:59 unless you change it. Monday seeds the same hours for the full week.
                  </p>
                </div>
              </div>

              <div className='table-like'>
                {(bundle?.openingHours ?? []).map((hour) => (
                  <form key={`${version}-${hour.id}`} className='card' onSubmit={(event) => void handleOpeningHourSave(event, hour.id)}>
                    <div className='inline-grid'>
                      <div className='field'>
                        <label htmlFor={`day-${hour.id}`}>Day</label>
                        <select id={`day-${hour.id}`} name='day_of_week' defaultValue={hour.day_of_week}>
                          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                            <option key={day} value={day}>
                              {dayLabel(day)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className='field'>
                        <label htmlFor={`open-${hour.id}`}>Open time</label>
                        <input
                          id={`open-${hour.id}`}
                          name='open_time'
                          type='time'
                          defaultValue={formValue(hour.open_time)}
                          onChange={autofillClosingTime}
                        />
                      </div>
                      <div className='field'>
                        <label htmlFor={`close-${hour.id}`}>Close time</label>
                        <input id={`close-${hour.id}`} name='close_time' type='time' defaultValue={formValue(hour.close_time)} />
                      </div>
                    </div>

                    <div className='switch-row'>
                      <label className='check'>
                        <input name='is_closed' type='checkbox' defaultChecked={hour.is_closed} /> Closed
                      </label>
                    </div>

                    <div className='toolbar'>
                      <div className='helper'>Row created {hour.created_at}</div>
                      <div className='search-row'>
                        <button className='button-ghost' type='button' onClick={() => void handleOpeningHourDelete(hour.id)}>
                          Delete
                        </button>
                        <button className='button' type='submit' disabled={savingAction === `opening-${hour.id}`}>
                          {savingAction === `opening-${hour.id}` ? 'Saving...' : 'Save row'}
                        </button>
                      </div>
                    </div>
                  </form>
                ))}

                <form className='card' onSubmit={handleOpeningHourAdd}>
                  <div className='inline-grid'>
                    <div className='field'>
                      <label htmlFor='new-day'>Day</label>
                      <select id='new-day' name='day_of_week' defaultValue={1}>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                          <option key={day} value={day}>
                            {dayLabel(day)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='field'>
                      <label htmlFor='new-open'>Open time</label>
                      <input id='new-open' name='open_time' type='time' onChange={autofillClosingTime} />
                    </div>
                    <div className='field'>
                      <label htmlFor='new-close'>Close time</label>
                      <input id='new-close' name='close_time' type='time' />
                    </div>
                  </div>
                  <div className='switch-row'>
                    <label className='check'>
                      <input name='is_closed' type='checkbox' /> Closed
                    </label>
                  </div>
                  <div className='toolbar'>
                    <div className='helper'>Add a new row to store_opening_hours.</div>
                    <button className='button' type='submit' disabled={savingAction === 'opening-new'}>
                      {savingAction === 'opening-new' ? 'Adding...' : 'Add opening row'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className='detail-card section'>
              <div className='section-head'>
                <div>
                  <span className='kicker'>Media assets</span>
                  <h2>Logo, cover, and gallery images</h2>
                  <p>Upload local images to preview instantly. Keep only preview, enhance, and remove actions.</p>
                </div>
                <div className='search-row'>
                  <span className='count-pill'>{localMediaPreviews.length} local pending</span>
                  <button className='button' type='button' onClick={() => void handleSaveLocalMediaChanges()} disabled={savingAction === 'media-save'}>
                    {savingAction === 'media-save' ? 'Saving images...' : 'Save image changes'}
                  </button>
                </div>
              </div>

              <div className='table-like'>
                {[
                  { key: 'logo' as const, label: 'Logo' },
                  { key: 'cover' as const, label: 'Cover Images' },
                  { key: 'gallery' as const, label: 'Gallery Images' },
                ].map((group) => {
                  const existingAssets = (bundle?.mediaAssets ?? []).filter((asset) => asset.asset_type === group.key);
                  const localAssets = localMediaPreviews.filter((asset) => asset.assetType === group.key);

                  return (
                    <section key={group.key} className='helper-box media-group'>
                      <h3>{group.label}</h3>

                      <div className='media-preview-grid'>
                        {existingAssets.map((asset) => (
                          <article key={asset.id} className='media-preview-card'>
                            <button
                              className='media-remove'
                              type='button'
                              onClick={() => void handleMediaAssetDelete(asset.id)}
                              aria-label='Remove image'
                            >
                              ×
                            </button>
                            <img src={mediaUrl(asset)} alt={`${group.label} preview`} className='media-preview-image' />
                            <div className='search-row media-actions'>
                              <select
                                className='asset-type-select'
                                value={asset.asset_type}
                                onChange={(e) => void handleChangeAssetType(asset.id, e.target.value as AssetType)}
                                aria-label='Change asset type'
                              >
                                <option value='logo'>Logo</option>
                                <option value='cover'>Cover</option>
                                <option value='gallery'>Gallery</option>
                              </select>

                              <select
                                className='asset-duplicate-select'
                                defaultValue=''
                                onChange={(e) => {
                                  const v = e.target.value as AssetType;
                                  if (v) {
                                    void handleDuplicateAsset(asset, v);
                                    e.currentTarget.value = '';
                                  }
                                }}
                                aria-label='Duplicate asset to group'
                              >
                                <option value=''>Duplicate as...</option>
                                <option value='logo'>Logo</option>
                                <option value='cover'>Cover</option>
                                <option value='gallery'>Gallery</option>
                              </select>

                              <button
                                className='button-ghost'
                                type='button'
                                onClick={() => void handleSetCoverImage(mediaUrl(asset))}
                                disabled={savingAction === 'cover-image'}
                              >
                                {store.cover_image === mediaUrl(asset) ? 'Cover image' : savingAction === 'cover-image' ? 'Saving...' : 'Set as cover'}
                              </button>
                            </div>
                          </article>
                        ))}

                        {localAssets.map((asset) => (
                          <article key={asset.id} className='media-preview-card'>
                            <button className='media-remove' type='button' onClick={() => handleRemoveLocalPreview(asset.id)} aria-label='Remove local preview'>
                              ×
                            </button>
                            <img src={asset.previewUrl} alt={`${group.label} local preview`} className='media-preview-image' />
                            <div className='small'>Local: {asset.fileName}</div>
                          </article>
                        ))}
                      </div>

                      <div className='field'>
                        <input
                          type='file'
                          accept='image/*'
                          multiple
                          onChange={(event) => {
                            handleLocalMediaFiles(group.key, event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
