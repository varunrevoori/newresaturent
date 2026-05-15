'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  approveRestaurant,
  arrayFromText,
  createMediaAsset,
  saveMediaAsset,
  createOpeningHour,
  dayLabel,
  deleteMediaAsset,
  deleteOpeningHour,
  fetchRestaurantBundle,
  nullableNumber,
  nullableString,
  parseJsonText,
  RestaurantBundle,
  saveOpeningHour,
  saveReview,
  textFromArray,
  updateRestaurant
} from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';

type AssetType = 'food' | 'ambience' | 'menu';

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

function requiredNumber(formData: FormData, name: string) {
  const rawValue = formValue(formData.get(name)).trim();
  if (!rawValue) {
    throw new Error(`${name} is required`);
  }

  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }

  return parsed;
}

function buildRestaurantUpdate(formData: FormData) {
  return {
    name: formValue(formData.get('name')).trim(),
    phone: nullableString(formData.get('phone')),
    area: nullableString(formData.get('area')),
    city: nullableString(formData.get('city')),
    full_address: nullableString(formData.get('full_address')),
    slug: nullableString(formData.get('slug')),
    cover_image: nullableString(formData.get('cover_image')),
    latitude: nullableNumber(formData.get('latitude')),
    longitude: nullableNumber(formData.get('longitude')),
    description: nullableString(formData.get('description')),
    cost_for_two: nullableNumber(formData.get('cost_for_two')),
    is_active: booleanValue(formData, 'is_active'),
    is_pure_veg: booleanValue(formData, 'is_pure_veg'),
    booking_enabled: booleanValue(formData, 'booking_enabled'),
    avg_duration_minutes: requiredNumber(formData, 'avg_duration_minutes'),
    max_bookings_per_slot: nullableNumber(formData.get('max_bookings_per_slot')),
    advance_booking_days: requiredNumber(formData, 'advance_booking_days'),
    modification_available: booleanValue(formData, 'modification_available'),
    modification_cutoff_minutes: nullableNumber(formData.get('modification_cutoff_minutes')),
    cancellation_available: booleanValue(formData, 'cancellation_available'),
    cancellation_cutoff_minutes: nullableNumber(formData.get('cancellation_cutoff_minutes')),
    cover_charge_enabled: booleanValue(formData, 'cover_charge_enabled'),
    cover_charge_amount: nullableNumber(formData.get('cover_charge_amount')),
    is_advertised: booleanValue(formData, 'is_advertised'),
    ad_priority: nullableNumber(formData.get('ad_priority')),
    ad_starts_at: nullableString(formData.get('ad_starts_at')),
    ad_ends_at: nullableString(formData.get('ad_ends_at')),
    ad_badge_text: nullableString(formData.get('ad_badge_text')),
    booking_terms: arrayFromText(formValue(formData.get('booking_terms'))),
    menu_json: parseJsonText(formValue(formData.get('menu_json'))),
    google_place_id: nullableString(formData.get('google_place_id')),
    source: nullableString(formData.get('source')),
    source_payload: parseJsonText(formValue(formData.get('source_payload'))),
    rating: nullableNumber(formData.get('rating')),
    user_ratings_total: nullableNumber(formData.get('user_ratings_total')),
    place_types: arrayFromText(formValue(formData.get('place_types'))),
    country: nullableString(formData.get('country')),
    isapproved: booleanValue(formData, 'isapproved'),
    ai_summary: nullableString(formData.get('ai_summary'))
  };
}

function buildOpeningHourPayload(formData: FormData) {
  return {
    day_of_week: Number(formValue(formData.get('day_of_week'))),
    open_time: nullableString(formData.get('open_time')),
    close_time: nullableString(formData.get('close_time')),
    is_closed: booleanValue(formData, 'is_closed')
  };
}

function buildReviewPayload(formData: FormData) {
  return {
    rating: requiredNumber(formData, 'rating'),
    review_text: nullableString(formData.get('review_text')),
    is_approved: booleanValue(formData, 'is_approved'),
    food_rating: nullableNumber(formData.get('food_rating')),
    service_rating: nullableNumber(formData.get('service_rating')),
    ambience_rating: nullableNumber(formData.get('ambience_rating')),
    drinks_rating: nullableNumber(formData.get('drinks_rating')),
    crowd_rating: nullableNumber(formData.get('crowd_rating')),
    owner_reply_text: nullableString(formData.get('owner_reply_text')),
    source: nullableString(formData.get('source')),
    external_review_id: nullableString(formData.get('external_review_id')),
    liked_tags: arrayFromText(formValue(formData.get('liked_tags'))),
    photo_urls: arrayFromText(formValue(formData.get('photo_urls')))
  };
}

export default function RestaurantDetailsPage() {
  const params = useParams<{ id: string }>();
  const restaurantId = params.id;
  const [bundle, setBundle] = useState<RestaurantBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [enhancementStatus, setEnhancementStatus] = useState<Record<string, string>>({});
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
    if (!restaurantId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchRestaurantBundle(restaurantId);
      setBundle(data);
      setVersion((current) => current + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load restaurant bundle');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  if (!restaurantId) {
    return (
      <main>
        <div className="error-box">Missing restaurant id.</div>
      </main>
    );
  }

  async function handleApproveChange(isapproved: boolean) {
    setSavingAction('approve');
    setNotice(null);

    try {
      const result = await approveRestaurant(restaurantId, isapproved);
      await loadBundle();
      setNotice(result?.message ?? (isapproved ? 'Restaurant approved.' : 'Restaurant marked as pending again.'));
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Failed to update approval state');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleRestaurantSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction('restaurant');
    setNotice(null);

    try {
      const payload = buildRestaurantUpdate(new FormData(event.currentTarget));
      if (!payload.name) {
        throw new Error('Restaurant name is required');
      }

      await updateRestaurant(restaurantId, payload);
      await loadBundle();
      setNotice('Restaurant details saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save restaurant');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleOpeningHourSave(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setSavingAction(`opening-${id}`);
    setNotice(null);

    try {
      await saveOpeningHour(id, buildOpeningHourPayload(new FormData(event.currentTarget)));
      await loadBundle();
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
      await createOpeningHour(restaurantId, buildOpeningHourPayload(new FormData(event.currentTarget)));
      event.currentTarget.reset();
      await loadBundle();
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
      await deleteOpeningHour(id);
      await loadBundle();
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
      await deleteMediaAsset(id);
      await loadBundle();
      setNotice('Media asset deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete media asset');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleReviewSave(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setSavingAction(`review-${id}`);
    setNotice(null);

    try {
      await saveReview(id, buildReviewPayload(new FormData(event.currentTarget)));
      await loadBundle();
      setNotice('Review updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save review');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleEnhanceImage(assetId: string, imageUrl: string | null | undefined) {
    if (!imageUrl) {
      setNotice('No image URL available to enhance.');
      return;
    }

    setEnhancementStatus((s) => ({ ...s, [assetId]: 'queuing' }));
    setNotice(null);

    try {
      const res = await fetch('/api/enhance-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, url: imageUrl, restaurantId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to queue enhancement');

      setEnhancementStatus((s) => ({ ...s, [assetId]: data.status || 'queued' }));
      setNotice('Image enhancement queued.');
    } catch (e) {
      setEnhancementStatus((s) => ({ ...s, [assetId]: 'error' }));
      setError(e instanceof Error ? e.message : 'Failed to queue enhancement');
    }
  }

  async function handleChangeAssetType(assetId: string, newType: AssetType) {
    setSavingAction('media-update');
    setNotice(null);
    try {
      await saveMediaAsset(assetId, { asset_type: newType });
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
      await createMediaAsset(restaurantId!, {
        asset_type: targetType,
        file_url: asset.file_url,
        file_path: asset.file_path,
        storage_public_url: asset.storage_public_url,
        storage_bucket: asset.storage_bucket,
        storage_path: asset.storage_path,
        mime_type: asset.mime_type,
        is_active: asset.is_active,
        sort_order: asset.sort_order
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
        file
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
      const existingBuckets = Array.from(
        new Set((bundle?.mediaAssets ?? []).map((asset) => asset.storage_bucket).filter(Boolean))
      ) as string[];
      const candidateBuckets = Array.from(
        new Set([
          ...existingBuckets,
          process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET,
          'restaurant-media',
          'restaurant_media',
          'media-assets',
          'media',
          'uploads'
        ].filter(Boolean))
      ) as string[];

      if (candidateBuckets.length === 0) {
        throw new Error('No storage bucket configured. Set NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET in .env.');
      }

      let resolvedBucket: string | null = null;

      for (let index = 0; index < localMediaPreviews.length; index += 1) {
        const preview = localMediaPreviews[index];
        let uploadBucket: string | null = resolvedBucket;
        let storagePath = '';
        let uploadErrorMessage = '';

        const tryBuckets: string[] = uploadBucket ? [uploadBucket] : candidateBuckets;

        for (const bucket of tryBuckets) {
          storagePath = `${restaurantId}/${preview.assetType}/${Date.now()}-${index}-${sanitizeFileName(preview.fileName)}`;
          const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, preview.file, {
            upsert: false,
            contentType: preview.file.type || undefined
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

        await createMediaAsset(restaurantId, {
          asset_type: preview.assetType,
          file_url: publicUrl,
          sort_order: baseSort + index,
          is_active: true,
          local_file_path: preview.fileName,
          mime_type: preview.file.type || null,
          storage_bucket: uploadBucket,
          storage_path: storagePath,
          storage_public_url: publicUrl
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
          : 'Failed to save images. Check storage bucket and insert permissions.'
      );
    } finally {
      setSavingAction(null);
    }
  }

  const restaurant = bundle?.restaurant;

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <span className="kicker">Restaurant detail</span>
          <h1>{restaurant?.name ?? 'Loading restaurant...'}</h1>
          <p>
            Edit the restaurant record, opening hours, media assets, and reviews from one screen. Approval changes are
            saved back to the same <strong>restaurants</strong> row.
          </p>

          <div className="topbar">
            <div className="search-row">
              <Link href="/" className="button-ghost">
                Back to dashboard
              </Link>
              <button className="toggle" type="button" onClick={() => void loadBundle()}>
                Reload data
              </button>
            </div>
            <div className="search-row">
              <span className={`status ${restaurant?.isapproved === true ? 'status-approved' : 'status-pending'}`}>
                {restaurant?.isapproved === true ? 'Approved' : 'Pending approval'}
              </span>
              <span className="count-pill">{bundle?.openingHours.length ?? 0} opening rows</span>
              <span className="count-pill">{bundle?.mediaAssets.length ?? 0} media assets</span>
              <span className="count-pill">{bundle?.reviews.length ?? 0} reviews</span>
            </div>
          </div>
        </section>

        {loading ? <div className="helper-box">Loading restaurant bundle...</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="success-box">{notice}</div> : null}

        {restaurant ? (
          <div className="section">
            <section className="detail-card">
              <div className="section-head">
                <div>
                  <span className="kicker">Restaurant record</span>
                  <h2>Core details</h2>
                  <p>Everything below writes back to the main restaurants table.</p>
                </div>
                <div className="search-row">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleApproveChange(true)}
                    disabled={restaurant.isapproved === true || savingAction === 'approve'}
                  >
                    {savingAction === 'approve' ? 'Saving...' : restaurant.isapproved === true ? 'Approved' : 'Approve'}
                  </button>
                  <button
                    className="button-ghost"
                    type="button"
                    onClick={() => void handleApproveChange(false)}
                    disabled={restaurant.isapproved === false || savingAction === 'approve'}
                  >
                    Mark pending
                  </button>
                </div>
              </div>

              <form key={version} className="section" onSubmit={handleRestaurantSave}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input id="name" name="name" type="text" defaultValue={restaurant.name} required />
                  </div>
                  <div className="field">
                    <label htmlFor="slug">Slug</label>
                    <input id="slug" name="slug" type="text" defaultValue={formValue(restaurant.slug)} />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Phone</label>
                    <input id="phone" name="phone" type="text" defaultValue={formValue(restaurant.phone)} />
                  </div>
                  <div className="field">
                    <label htmlFor="country">Country</label>
                    <input id="country" name="country" type="text" defaultValue={formValue(restaurant.country)} />
                  </div>
                  <div className="field">
                    <label htmlFor="area">Area</label>
                    <input id="area" name="area" type="text" defaultValue={formValue(restaurant.area)} />
                  </div>
                  <div className="field">
                    <label htmlFor="city">City</label>
                    <input id="city" name="city" type="text" defaultValue={formValue(restaurant.city)} />
                  </div>
                  <div className="field">
                    <label htmlFor="full_address">Full address</label>
                    <textarea id="full_address" name="full_address" defaultValue={formValue(restaurant.full_address)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cover_image">Cover image URL</label>
                    <input id="cover_image" name="cover_image" type="url" defaultValue={formValue(restaurant.cover_image)} />
                  </div>
                  <div className="field">
                    <label htmlFor="latitude">Latitude</label>
                    <input id="latitude" name="latitude" type="number" step="any" defaultValue={formValue(restaurant.latitude)} />
                  </div>
                  <div className="field">
                    <label htmlFor="longitude">Longitude</label>
                    <input id="longitude" name="longitude" type="number" step="any" defaultValue={formValue(restaurant.longitude)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cost_for_two">Cost for two</label>
                    <input id="cost_for_two" name="cost_for_two" type="number" step="1" defaultValue={formValue(restaurant.cost_for_two)} />
                  </div>
                  <div className="field">
                    <label htmlFor="avg_duration_minutes">Average duration minutes</label>
                    <input id="avg_duration_minutes" name="avg_duration_minutes" type="number" step="1" defaultValue={formValue(restaurant.avg_duration_minutes)} />
                  </div>
                  <div className="field">
                    <label htmlFor="max_bookings_per_slot">Max bookings per slot</label>
                    <input id="max_bookings_per_slot" name="max_bookings_per_slot" type="number" step="1" defaultValue={formValue(restaurant.max_bookings_per_slot)} />
                  </div>
                  <div className="field">
                    <label htmlFor="advance_booking_days">Advance booking days</label>
                    <input id="advance_booking_days" name="advance_booking_days" type="number" step="1" defaultValue={formValue(restaurant.advance_booking_days)} />
                  </div>
                  <div className="field">
                    <label htmlFor="modification_cutoff_minutes">Modification cutoff minutes</label>
                    <input id="modification_cutoff_minutes" name="modification_cutoff_minutes" type="number" step="1" defaultValue={formValue(restaurant.modification_cutoff_minutes)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cancellation_cutoff_minutes">Cancellation cutoff minutes</label>
                    <input id="cancellation_cutoff_minutes" name="cancellation_cutoff_minutes" type="number" step="1" defaultValue={formValue(restaurant.cancellation_cutoff_minutes)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cover_charge_amount">Cover charge amount</label>
                    <input id="cover_charge_amount" name="cover_charge_amount" type="number" step="any" defaultValue={formValue(restaurant.cover_charge_amount)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ad_priority">Ad priority</label>
                    <input id="ad_priority" name="ad_priority" type="number" step="1" defaultValue={formValue(restaurant.ad_priority)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ad_starts_at">Ad starts at</label>
                    <input id="ad_starts_at" name="ad_starts_at" type="text" defaultValue={formValue(restaurant.ad_starts_at)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ad_ends_at">Ad ends at</label>
                    <input id="ad_ends_at" name="ad_ends_at" type="text" defaultValue={formValue(restaurant.ad_ends_at)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ad_badge_text">Ad badge text</label>
                    <input id="ad_badge_text" name="ad_badge_text" type="text" defaultValue={formValue(restaurant.ad_badge_text)} />
                  </div>
                  <div className="field">
                    <label htmlFor="google_place_id">Google place id</label>
                    <input id="google_place_id" name="google_place_id" type="text" defaultValue={formValue(restaurant.google_place_id)} />
                  </div>
                  <div className="field">
                    <label htmlFor="source">Source</label>
                    <input id="source" name="source" type="text" defaultValue={formValue(restaurant.source)} />
                  </div>
                  <div className="field">
                    <label htmlFor="rating">Rating</label>
                    <input id="rating" name="rating" type="number" step="any" defaultValue={formValue(restaurant.rating)} />
                  </div>
                  <div className="field">
                    <label htmlFor="user_ratings_total">User ratings total</label>
                    <input id="user_ratings_total" name="user_ratings_total" type="number" step="1" defaultValue={formValue(restaurant.user_ratings_total)} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" name="description" defaultValue={formValue(restaurant.description)} />
                </div>

                <div className="field">
                  <label htmlFor="ai_summary">AI Summary</label>
                  <textarea id="ai_summary" name="ai_summary" defaultValue={formValue(restaurant.ai_summary)} />
                </div>

                <div className="field">
                  <label htmlFor="booking_terms">Booking terms</label>
                  <textarea id="booking_terms" name="booking_terms" defaultValue={textFromArray(restaurant.booking_terms)} />
                </div>

                <div className="field">
                  <label htmlFor="place_types">Place types</label>
                  <textarea id="place_types" name="place_types" defaultValue={textFromArray(restaurant.place_types)} />
                </div>

                <div className="field">
                  <label htmlFor="menu_json">Menu JSON</label>
                  <textarea id="menu_json" name="menu_json" defaultValue={jsonText(restaurant.menu_json)} />
                </div>

                <div className="field">
                  <label htmlFor="source_payload">Source payload JSON</label>
                  <textarea id="source_payload" name="source_payload" defaultValue={jsonText(restaurant.source_payload)} />
                </div>

                <div className="switch-row">
                  <label className="check"><input name="is_active" type="checkbox" defaultChecked={restaurant.is_active} /> Active</label>
                  <label className="check"><input name="is_pure_veg" type="checkbox" defaultChecked={restaurant.is_pure_veg} /> Pure veg</label>
                  <label className="check"><input name="booking_enabled" type="checkbox" defaultChecked={restaurant.booking_enabled} /> Booking enabled</label>
                  <label className="check"><input name="modification_available" type="checkbox" defaultChecked={restaurant.modification_available} /> Modification available</label>
                  <label className="check"><input name="cancellation_available" type="checkbox" defaultChecked={restaurant.cancellation_available} /> Cancellation available</label>
                  <label className="check"><input name="cover_charge_enabled" type="checkbox" defaultChecked={restaurant.cover_charge_enabled} /> Cover charge enabled</label>
                  <label className="check"><input name="is_advertised" type="checkbox" defaultChecked={restaurant.is_advertised} /> Advertised</label>
                  <label className="check"><input name="isapproved" type="checkbox" defaultChecked={restaurant.isapproved === true} /> Approved</label>
                </div>

                <div className="toolbar">
                  <div className="helper">Updated at {restaurant.updated_at}</div>
                  <button className="button" type="submit" disabled={savingAction === 'restaurant'}>
                    {savingAction === 'restaurant' ? 'Saving restaurant...' : 'Save restaurant'}
                  </button>
                </div>
              </form>
            </section>

            <section className="detail-card section">
              <div className="section-head">
                <div>
                  <span className="kicker">Opening hours</span>
                  <h2>Schedule</h2>
                  <p>Each row updates the restaurant_opening_hours table.</p>
                </div>
              </div>

              <div className="table-like">
                {(bundle?.openingHours ?? []).map((hour) => (
                  <form key={`${version}-${hour.id}`} className="card" onSubmit={(event) => void handleOpeningHourSave(event, hour.id)}>
                    <div className="inline-grid">
                      <div className="field">
                        <label htmlFor={`day-${hour.id}`}>Day</label>
                        <select id={`day-${hour.id}`} name="day_of_week" defaultValue={hour.day_of_week}>
                          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                            <option key={day} value={day}>
                              {dayLabel(day)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`open-${hour.id}`}>Open time</label>
                        <input id={`open-${hour.id}`} name="open_time" type="time" defaultValue={formValue(hour.open_time)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`close-${hour.id}`}>Close time</label>
                        <input id={`close-${hour.id}`} name="close_time" type="time" defaultValue={formValue(hour.close_time)} />
                      </div>
                    </div>

                    <div className="switch-row">
                      <label className="check"><input name="is_closed" type="checkbox" defaultChecked={hour.is_closed} /> Closed</label>
                    </div>

                    <div className="toolbar">
                      <div className="helper">Row created {hour.created_at}</div>
                      <div className="search-row">
                        <button className="button-ghost" type="button" onClick={() => void handleOpeningHourDelete(hour.id)}>
                          Delete
                        </button>
                        <button className="button" type="submit" disabled={savingAction === `opening-${hour.id}`}>
                          {savingAction === `opening-${hour.id}` ? 'Saving...' : 'Save row'}
                        </button>
                      </div>
                    </div>
                  </form>
                ))}

                <form className="card" onSubmit={handleOpeningHourAdd}>
                  <div className="inline-grid">
                    <div className="field">
                      <label htmlFor="new-day">Day</label>
                      <select id="new-day" name="day_of_week" defaultValue={1}>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                          <option key={day} value={day}>
                            {dayLabel(day)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="new-open">Open time</label>
                      <input id="new-open" name="open_time" type="time" />
                    </div>
                    <div className="field">
                      <label htmlFor="new-close">Close time</label>
                      <input id="new-close" name="close_time" type="time" />
                    </div>
                  </div>
                  <div className="switch-row">
                    <label className="check"><input name="is_closed" type="checkbox" /> Closed</label>
                  </div>
                  <div className="toolbar">
                    <div className="helper">Add a new row to restaurant_opening_hours.</div>
                    <button className="button" type="submit" disabled={savingAction === 'opening-new'}>
                      {savingAction === 'opening-new' ? 'Adding...' : 'Add opening row'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="detail-card section">
              <div className="section-head">
                <div>
                  <span className="kicker">Media assets</span>
                  <h2>Images and menus</h2>
                  <p>Upload local images to preview instantly. Keep only preview, enhance, and remove actions.</p>
                </div>
                <div className="search-row">
                  <span className="count-pill">{localMediaPreviews.length} local pending</span>
                  <button className="button" type="button" onClick={() => void handleSaveLocalMediaChanges()} disabled={savingAction === 'media-save'}>
                    {savingAction === 'media-save' ? 'Saving images...' : 'Save image changes'}
                  </button>
                </div>
              </div>

              <div className="table-like">
                {[
                  { key: 'food' as const, label: 'Food Images' },
                  { key: 'ambience' as const, label: 'Ambience Images' },
                  { key: 'menu' as const, label: 'Menu Images' }
                ].map((group) => {
                  const existingAssets = (bundle?.mediaAssets ?? []).filter((asset) => asset.asset_type === group.key);
                  const localAssets = localMediaPreviews.filter((asset) => asset.assetType === group.key);

                  return (
                    <section key={group.key} className="helper-box media-group">
                      <h3>{group.label}</h3>

                      <div className="media-preview-grid">
                        {existingAssets.map((asset) => (
                          <article key={asset.id} className="media-preview-card">
                            <button
                              className="media-remove"
                              type="button"
                              onClick={() => void handleMediaAssetDelete(asset.id)}
                              aria-label="Remove image"
                            >
                              ×
                            </button>
                            <img src={mediaUrl(asset)} alt={`${group.label} preview`} className="media-preview-image" />
                            <div className="search-row media-actions">
                              <select
                                className="asset-type-select"
                                value={asset.asset_type}
                                onChange={(e) => void handleChangeAssetType(asset.id, e.target.value as AssetType)}
                                aria-label="Change asset type"
                              >
                                <option value="food">Food</option>
                                <option value="ambience">Ambience</option>
                                <option value="menu">Menu</option>
                              </select>

                              <select
                                className="asset-duplicate-select"
                                defaultValue=""
                                onChange={(e) => {
                                  const v = e.target.value as AssetType;
                                  if (v) {
                                    void handleDuplicateAsset(asset, v);
                                    e.currentTarget.value = '';
                                  }
                                }}
                                aria-label="Duplicate asset to group"
                              >
                                <option value="">Duplicate as...</option>
                                <option value="food">Food</option>
                                <option value="ambience">Ambience</option>
                                <option value="menu">Menu</option>
                              </select>

                              <button
                                className="button"
                                type="button"
                                onClick={() => void handleEnhanceImage(asset.id, mediaUrl(asset))}
                                disabled={enhancementStatus[asset.id] === 'queuing' || enhancementStatus[asset.id] === 'enhancing'}
                              >
                                {enhancementStatus[asset.id] === 'queuing'
                                  ? 'Queuing...'
                                  : enhancementStatus[asset.id] === 'queued'
                                  ? 'Queued'
                                  : enhancementStatus[asset.id] === 'error'
                                  ? 'Retry'
                                  : 'Enhance'}
                              </button>
                            </div>
                          </article>
                        ))}

                        {localAssets.map((asset) => (
                          <article key={asset.id} className="media-preview-card">
                            <button
                              className="media-remove"
                              type="button"
                              onClick={() => handleRemoveLocalPreview(asset.id)}
                              aria-label="Remove local preview"
                            >
                              ×
                            </button>
                            <img src={asset.previewUrl} alt={`${group.label} local preview`} className="media-preview-image" />
                            <div className="search-row media-actions">
                              <button
                                className="button"
                                type="button"
                                onClick={() => setNotice('Save image changes first, then use Enhance.')}
                              >
                                Enhance
                              </button>
                            </div>
                            <div className="small">Local: {asset.fileName}</div>
                          </article>
                        ))}
                      </div>

                      <div className="field">
                        <input
                          type="file"
                          accept="image/*"
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

            <section className="detail-card section">
              <div className="section-head">
                <div>
                  <span className="kicker">Reviews</span>
                  <h2>Customer feedback</h2>
                  <p>Edit approval, reply text, and rating fields in restaurant_reviews.</p>
                </div>
              </div>

              <div className="table-like">
                {(bundle?.reviews ?? []).map((review) => (
                  <form key={`${version}-${review.id}`} className="card" onSubmit={(event) => void handleReviewSave(event, review.id)}>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor={`review-rating-${review.id}`}>Rating</label>
                        <input id={`review-rating-${review.id}`} name="rating" type="number" step="any" defaultValue={formValue(review.rating)} required />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-food-${review.id}`}>Food rating</label>
                        <input id={`review-food-${review.id}`} name="food_rating" type="number" step="any" defaultValue={formValue(review.food_rating)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-service-${review.id}`}>Service rating</label>
                        <input id={`review-service-${review.id}`} name="service_rating" type="number" step="any" defaultValue={formValue(review.service_rating)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-ambience-${review.id}`}>Ambience rating</label>
                        <input id={`review-ambience-${review.id}`} name="ambience_rating" type="number" step="any" defaultValue={formValue(review.ambience_rating)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-drinks-${review.id}`}>Drinks rating</label>
                        <input id={`review-drinks-${review.id}`} name="drinks_rating" type="number" step="any" defaultValue={formValue(review.drinks_rating)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-crowd-${review.id}`}>Crowd rating</label>
                        <input id={`review-crowd-${review.id}`} name="crowd_rating" type="number" step="any" defaultValue={formValue(review.crowd_rating)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-source-${review.id}`}>Source</label>
                        <input id={`review-source-${review.id}`} name="source" type="text" defaultValue={formValue(review.source)} />
                      </div>
                      <div className="field">
                        <label htmlFor={`review-ext-${review.id}`}>External review id</label>
                        <input id={`review-ext-${review.id}`} name="external_review_id" type="text" defaultValue={formValue(review.external_review_id)} />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor={`review-text-${review.id}`}>Review text</label>
                      <textarea id={`review-text-${review.id}`} name="review_text" defaultValue={formValue(review.review_text)} />
                    </div>

                    <div className="field">
                      <label htmlFor={`review-reply-${review.id}`}>Owner reply</label>
                      <textarea id={`review-reply-${review.id}`} name="owner_reply_text" defaultValue={formValue(review.owner_reply_text)} />
                    </div>

                    <div className="field">
                      <label htmlFor={`review-tags-${review.id}`}>Liked tags</label>
                      <textarea id={`review-tags-${review.id}`} name="liked_tags" defaultValue={textFromArray(review.liked_tags)} />
                    </div>

                    <div className="field">
                      <label htmlFor={`review-photos-${review.id}`}>Photo URLs</label>
                      <textarea id={`review-photos-${review.id}`} name="photo_urls" defaultValue={textFromArray(review.photo_urls)} />
                    </div>

                    <div className="switch-row">
                      <label className="check"><input name="is_approved" type="checkbox" defaultChecked={review.is_approved} /> Approved</label>
                    </div>

                    <div className="toolbar">
                      <div className="helper">
                        By {review.username_snapshot || 'unknown user'} · created {review.created_at}
                      </div>
                      <button className="button" type="submit" disabled={savingAction === `review-${review.id}`}>
                        {savingAction === `review-${review.id}` ? 'Saving...' : 'Save review'}
                      </button>
                    </div>
                  </form>
                ))}

                {bundle?.reviews.length === 0 ? <div className="helper-box">No reviews found for this restaurant.</div> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
