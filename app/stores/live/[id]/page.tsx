'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  deleteLiveStoreOpeningHour,
  fetchLiveStoreBundle,
  LiveStoreBundle,
  saveLiveStoreOpeningHours,
  updateLiveStore,
} from '@/lib/live-store-dashboard';

function formValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
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

function dayLabel(dayOfWeek: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function buildStoreUpdate(formData: FormData) {
  return {
    name: formValue(formData.get('name')).trim(),
    description: nullableString(formData.get('description')),
    category: nullableString(formData.get('category')),
    subcategory: nullableString(formData.get('subcategory')),
    location_name: nullableString(formData.get('location_name')),
    address_line1: nullableString(formData.get('address_line1')),
    address_line2: nullableString(formData.get('address_line2')),
    city: nullableString(formData.get('city')),
    region: nullableString(formData.get('region')),
    country: nullableString(formData.get('country')),
    postal_code: nullableString(formData.get('postal_code')),
    lat: nullableNumber(formData.get('lat')),
    lng: nullableNumber(formData.get('lng')),
    google_place_id: nullableString(formData.get('google_place_id')),
    phone: nullableString(formData.get('phone')),
    whatsapp: nullableString(formData.get('whatsapp')),
    email: nullableString(formData.get('email')),
    website: nullableString(formData.get('website')),
    is_active: booleanValue(formData, 'is_active'),
    is_featured: booleanValue(formData, 'is_featured'),
    is_top_brand: booleanValue(formData, 'is_top_brand'),
  };
}

function buildOpeningHourRow(formData: FormData) {
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

export default function LiveStoreDetailsPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const [bundle, setBundle] = useState<LiveStoreBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [savingAction, setSavingAction] = useState<string | null>(null);

  async function loadBundle() {
    if (!storeId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchLiveStoreBundle(storeId);
      setBundle(data);
      setVersion((current) => current + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load live store');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (!storeId) {
    return (
      <main>
        <div className="error-box">Missing store id.</div>
      </main>
    );
  }

  async function handleStoreSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAction('store');
    setNotice(null);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = buildStoreUpdate(formData);
      if (!payload.name) {
        throw new Error('Store name is required');
      }

      const result = await updateLiveStore(storeId, payload);
      if (result?.error) {
        throw new Error(result.error);
      }

      await loadBundle();
      setNotice('Live store updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save store');
    } finally {
      setSavingAction(null);
    }
  }

  async function handleOpeningHourSave(event: FormEvent<HTMLFormElement>, existingId?: string) {
    event.preventDefault();
    setSavingAction(existingId ? `opening-${existingId}` : 'opening-new');
    setNotice(null);

    try {
      const row = buildOpeningHourRow(new FormData(event.currentTarget));
      const result = await saveLiveStoreOpeningHours(storeId, [row]);
      if (result?.error) {
        throw new Error(result.error);
      }

      if (!existingId) {
        event.currentTarget.reset();
      }

      await loadBundle();
      setNotice('Opening hours updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save opening hours');
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
      const result = await deleteLiveStoreOpeningHour(id);
      if (result?.error) {
        throw new Error(result.error);
      }

      await loadBundle();
      setNotice('Opening hour row deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete opening hour');
    } finally {
      setSavingAction(null);
    }
  }

  const store = bundle?.store;

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <span className="kicker">Live production store</span>
          <h1>{store?.name ?? 'Loading store...'}</h1>
          <p>
            This record is already live in the second database and visible to PassPrivé customers on{' '}
            <strong>/stores</strong>. Core details and opening hours save directly to production. Media, tags,
            offers, and catalogue items are shown read-only here — manage those through the merchant tools that
            already own them.
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
              <span className={`status ${store?.is_active ? 'status-approved' : 'status-pending'}`}>
                {store?.is_active ? 'Active' : 'Inactive'}
              </span>
              {store?.is_featured ? <span className="status status-active">Featured</span> : null}
              {store?.is_top_brand ? <span className="status status-active">Top brand</span> : null}
              <span className="count-pill">{bundle?.openingHours.length ?? 0} opening rows</span>
              <span className="count-pill">{bundle?.mediaAssets.length ?? 0} media assets</span>
              <span className="count-pill">{bundle?.offers.length ?? 0} offers</span>
              <span className="count-pill">{bundle?.catalogueItemCount ?? 0} catalogue items</span>
            </div>
          </div>
        </section>

        {loading ? <div className="helper-box">Loading live store...</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="success-box">{notice}</div> : null}

        {store ? (
          <div className="section">
            <section className="detail-card">
              <div className="section-head">
                <div>
                  <span className="kicker">Store record</span>
                  <h2>Core details</h2>
                  <p>Everything below writes straight back to the production stores table.</p>
                </div>
              </div>

              <form key={version} className="section" onSubmit={handleStoreSave}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input id="name" name="name" type="text" defaultValue={store.name} required />
                  </div>
                  <div className="field">
                    <label htmlFor="slug">Slug</label>
                    <input id="slug" name="slug" type="text" defaultValue={formValue(store.slug)} disabled title="Change with care - slug is used in public URLs" />
                  </div>
                  <div className="field">
                    <label htmlFor="category">Category</label>
                    <input id="category" name="category" type="text" defaultValue={formValue(store.category)} />
                  </div>
                  <div className="field">
                    <label htmlFor="subcategory">Subcategory</label>
                    <input id="subcategory" name="subcategory" type="text" defaultValue={formValue(store.subcategory)} />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Phone</label>
                    <input id="phone" name="phone" type="text" defaultValue={formValue(store.phone)} />
                  </div>
                  <div className="field">
                    <label htmlFor="whatsapp">WhatsApp</label>
                    <input id="whatsapp" name="whatsapp" type="text" defaultValue={formValue(store.whatsapp)} />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="text" defaultValue={formValue(store.email)} />
                  </div>
                  <div className="field">
                    <label htmlFor="website">Website</label>
                    <input id="website" name="website" type="text" defaultValue={formValue(store.website)} />
                  </div>
                  <div className="field">
                    <label htmlFor="location_name">Location name</label>
                    <input id="location_name" name="location_name" type="text" defaultValue={formValue(store.location_name)} />
                  </div>
                  <div className="field">
                    <label htmlFor="address_line1">Address line 1</label>
                    <input id="address_line1" name="address_line1" type="text" defaultValue={formValue(store.address_line1)} />
                  </div>
                  <div className="field">
                    <label htmlFor="address_line2">Address line 2</label>
                    <input id="address_line2" name="address_line2" type="text" defaultValue={formValue(store.address_line2)} />
                  </div>
                  <div className="field">
                    <label htmlFor="city">City</label>
                    <input id="city" name="city" type="text" defaultValue={formValue(store.city)} />
                  </div>
                  <div className="field">
                    <label htmlFor="region">Region</label>
                    <input id="region" name="region" type="text" defaultValue={formValue(store.region)} />
                  </div>
                  <div className="field">
                    <label htmlFor="country">Country</label>
                    <input id="country" name="country" type="text" defaultValue={formValue(store.country)} />
                  </div>
                  <div className="field">
                    <label htmlFor="postal_code">Postal code</label>
                    <input id="postal_code" name="postal_code" type="text" defaultValue={formValue(store.postal_code)} />
                  </div>
                  <div className="field">
                    <label htmlFor="lat">Latitude</label>
                    <input id="lat" name="lat" type="number" step="any" defaultValue={formValue(store.lat)} />
                  </div>
                  <div className="field">
                    <label htmlFor="lng">Longitude</label>
                    <input id="lng" name="lng" type="number" step="any" defaultValue={formValue(store.lng)} />
                  </div>
                  <div className="field">
                    <label htmlFor="google_place_id">Google place id</label>
                    <input id="google_place_id" name="google_place_id" type="text" defaultValue={formValue(store.google_place_id)} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" name="description" defaultValue={formValue(store.description)} />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Logo</label>
                    {store.logo_url ? (
                      <img src={store.logo_url} alt="Store logo" className="media-preview-image" style={{ maxWidth: 160 }} />
                    ) : (
                      <div className="helper-box">No logo set.</div>
                    )}
                  </div>
                  <div className="field">
                    <label>Cover image</label>
                    {store.cover_image ? (
                      <img src={store.cover_image} alt="Store cover" className="media-preview-image" style={{ maxWidth: 280 }} />
                    ) : (
                      <div className="helper-box">No cover image set.</div>
                    )}
                  </div>
                </div>

                <div className="switch-row">
                  <label className="check">
                    <input name="is_active" type="checkbox" defaultChecked={store.is_active} /> Active
                  </label>
                  <label className="check">
                    <input name="is_featured" type="checkbox" defaultChecked={store.is_featured} /> Featured
                  </label>
                  <label className="check">
                    <input name="is_top_brand" type="checkbox" defaultChecked={store.is_top_brand} /> Top brand
                  </label>
                </div>

                <div className="toolbar">
                  <div className="helper">Updated at {store.updated_at}</div>
                  <button className="button" type="submit" disabled={savingAction === 'store'}>
                    {savingAction === 'store' ? 'Saving...' : 'Save store'}
                  </button>
                </div>
              </form>
            </section>

            <section className="detail-card section">
              <div className="section-head">
                <div>
                  <span className="kicker">Opening hours</span>
                  <h2>Schedule</h2>
                  <p>Each row writes to store_opening_hours on the production database.</p>
                </div>
              </div>

              <div className="table-like">
                {(bundle?.openingHours ?? []).map((hour) => (
                  <form key={`${version}-${hour.id}`} className="card" onSubmit={(event) => void handleOpeningHourSave(event, hour.id)}>
                    <div className="inline-grid">
                      <div className="field">
                        <label htmlFor={`day-${hour.id}`}>Day</label>
                        <select id={`day-${hour.id}`} name="day_of_week" defaultValue={hour.day_of_week} disabled>
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
                      <label className="check">
                        <input name="is_closed" type="checkbox" defaultChecked={hour.is_closed} /> Closed
                      </label>
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

                <form className="card" onSubmit={(event) => void handleOpeningHourSave(event)}>
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
                    <label className="check">
                      <input name="is_closed" type="checkbox" /> Closed
                    </label>
                  </div>
                  <div className="toolbar">
                    <div className="helper">Add or overwrite the row for that day.</div>
                    <button className="button" type="submit" disabled={savingAction === 'opening-new'}>
                      {savingAction === 'opening-new' ? 'Saving...' : 'Save opening row'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="detail-card section">
              <div className="section-head">
                <div>
                  <span className="kicker">Read-only</span>
                  <h2>Media, tags, offers &amp; socials</h2>
                  <p>Shown for context. Edit these through the systems that already manage them for production stores.</p>
                </div>
              </div>

              <div className="table-like">
                <div className="helper-box media-group">
                  <h3>Media assets</h3>
                  {bundle?.mediaAssets.length ? (
                    <div className="media-preview-grid">
                      {bundle.mediaAssets.map((asset) => (
                        <article key={asset.id} className="media-preview-card">
                          <img src={asset.file_url} alt={asset.asset_type} className="media-preview-image" />
                          <span className="chip">{asset.asset_type}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="meta">No media assets on file.</p>
                  )}
                </div>

                <div className="helper-box">
                  <h3>Tags</h3>
                  {bundle?.tags.length ? (
                    <div className="meta-row">
                      {bundle.tags.map((tag) => (
                        <span key={tag.id} className="chip">
                          {tag.tag_value}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="meta">No tags on file.</p>
                  )}
                </div>

                <div className="helper-box">
                  <h3>Offers</h3>
                  {bundle?.offers.length ? (
                    <div className="stack">
                      {bundle.offers.map((offer) => (
                        <div key={offer.id} className="item-title">
                          <strong>{offer.title}</strong>
                          {offer.badge_text ? <span className="chip">{offer.badge_text}</span> : null}
                          <span className={`status ${offer.is_active ? 'status-approved' : 'status-pending'}`}>
                            {offer.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="meta">No offers on file.</p>
                  )}
                </div>

                <div className="helper-box">
                  <h3>Social links</h3>
                  {bundle?.socialLinks.length ? (
                    <div className="meta-row">
                      {bundle.socialLinks.map((link) => (
                        <a key={link.id} className="chip" href={link.url} target="_blank" rel="noreferrer">
                          {link.platform}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="meta">No social links on file.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
