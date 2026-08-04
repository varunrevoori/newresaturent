'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveRestaurant, fetchRestaurants, fetchApprovedCount, fetchPendingCount, Restaurant } from '@/lib/dashboard';
import { approveStore, fetchStores, fetchApprovedStoreCount, fetchPendingStoreCount, Store } from '@/lib/store-dashboard';
import { fetchLiveStores, LiveStore } from '@/lib/live-store-dashboard';

type EntityTab = 'restaurants' | 'stores';
type StoreViewMode = 'queue' | 'live';

function restaurantLocation(restaurant: Restaurant) {
  return [restaurant.area, restaurant.city, restaurant.country].filter(Boolean).join(' · ');
}

function storeLocation(store: Store) {
  return [store.area, store.city, store.country].filter(Boolean).join(' · ');
}

function liveStoreLocation(store: LiveStore) {
  return [store.location_name, store.city, store.country].filter(Boolean).join(' · ');
}

export default function HomePage() {
  const router = useRouter();
  const [entityTab, setEntityTab] = useState<EntityTab>('restaurants');

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [restaurantsError, setRestaurantsError] = useState<string | null>(null);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState<'pending' | 'approved'>('pending');
  const [savingRestaurantId, setSavingRestaurantId] = useState<string | null>(null);
  const [restaurantReloadCount, setRestaurantReloadCount] = useState(0);
  const [approvedRestaurantCount, setApprovedRestaurantCount] = useState(0);
  const [pendingRestaurantCount, setPendingRestaurantCount] = useState(0);

  const [storeViewMode, setStoreViewMode] = useState<StoreViewMode>('queue');

  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [storeSearch, setStoreSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<'pending' | 'approved'>('pending');
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);
  const [storeReloadCount, setStoreReloadCount] = useState(0);
  const [approvedStoreCount, setApprovedStoreCount] = useState(0);
  const [pendingStoreCount, setPendingStoreCount] = useState(0);

  const [liveStores, setLiveStores] = useState<LiveStore[]>([]);
  const [liveStoresLoading, setLiveStoresLoading] = useState(true);
  const [liveStoresError, setLiveStoresError] = useState<string | null>(null);
  const [liveStoreSearch, setLiveStoreSearch] = useState('');
  const [liveStoreReloadCount, setLiveStoreReloadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setRestaurantsLoading(true);
      setRestaurantsError(null);

      try {
        const [data, approvedCount, pendingCount] = await Promise.all([
          fetchRestaurants(restaurantFilter === 'approved'),
          fetchApprovedCount(),
          fetchPendingCount()
        ]);
        if (active) {
          setRestaurants(data);
          setApprovedRestaurantCount(approvedCount);
          setPendingRestaurantCount(pendingCount);
        }
      } catch (loadError) {
        if (active) {
          setRestaurantsError(loadError instanceof Error ? loadError.message : 'Failed to load restaurants');
        }
      } finally {
        if (active) {
          setRestaurantsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [restaurantFilter, restaurantReloadCount]);

  useEffect(() => {
    let active = true;

    async function load() {
      setStoresLoading(true);
      setStoresError(null);

      try {
        const [data, approvedCount, pendingCount] = await Promise.all([
          fetchStores(storeFilter === 'approved'),
          fetchApprovedStoreCount(),
          fetchPendingStoreCount()
        ]);
        if (active) {
          setStores(data);
          setApprovedStoreCount(approvedCount);
          setPendingStoreCount(pendingCount);
        }
      } catch (loadError) {
        if (active) {
          setStoresError(loadError instanceof Error ? loadError.message : 'Failed to load stores');
        }
      } finally {
        if (active) {
          setStoresLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [storeFilter, storeReloadCount]);

  useEffect(() => {
    if (entityTab !== 'stores' || storeViewMode !== 'live') {
      return;
    }

    let active = true;

    async function load() {
      setLiveStoresLoading(true);
      setLiveStoresError(null);

      try {
        const data = await fetchLiveStores();
        if (active) {
          setLiveStores(data);
        }
      } catch (loadError) {
        if (active) {
          setLiveStoresError(loadError instanceof Error ? loadError.message : 'Failed to load live stores');
        }
      } finally {
        if (active) {
          setLiveStoresLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [entityTab, storeViewMode, liveStoreReloadCount]);

  const filteredRestaurants = useMemo(() => {
    const term = restaurantSearch.trim().toLowerCase();
    if (!term) {
      return restaurants;
    }

    return restaurants.filter((restaurant) => {
      const haystack = [restaurant.name, restaurant.city, restaurant.area, restaurant.slug, restaurant.google_place_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [restaurants, restaurantSearch]);

  const filteredStores = useMemo(() => {
    const term = storeSearch.trim().toLowerCase();
    if (!term) {
      return stores;
    }

    return stores.filter((store) => {
      const haystack = [store.name, store.city, store.area, store.slug, store.google_place_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [stores, storeSearch]);

  const filteredLiveStores = useMemo(() => {
    const term = liveStoreSearch.trim().toLowerCase();
    if (!term) {
      return liveStores;
    }

    return liveStores.filter((store) => {
      const haystack = [store.name, store.city, store.location_name, store.slug, store.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [liveStores, liveStoreSearch]);

  async function handleApproveRestaurant(restaurantId: string) {
    setSavingRestaurantId(restaurantId);

    try {
      await approveRestaurant(restaurantId, true);
      setRestaurantReloadCount((current) => current + 1);
    } catch (approveError) {
      setRestaurantsError(approveError instanceof Error ? approveError.message : 'Failed to approve restaurant');
    } finally {
      setSavingRestaurantId(null);
    }
  }

  async function handleApproveStore(storeId: string) {
    setSavingStoreId(storeId);

    try {
      await approveStore(storeId, true);
      setStoreReloadCount((current) => current + 1);
    } catch (approveError) {
      setStoresError(approveError instanceof Error ? approveError.message : 'Failed to approve store');
    } finally {
      setSavingStoreId(null);
    }
  }

  return (
    <main>
      <div className="shell">
        <nav className="nav-tabs" aria-label="Choose listing type">
          <button
            className={`nav-tab${entityTab === 'restaurants' ? ' active' : ''}`}
            type="button"
            onClick={() => setEntityTab('restaurants')}
          >
            Restaurants
            <span className="nav-tab-count">{pendingRestaurantCount} pending</span>
          </button>
          <button
            className={`nav-tab${entityTab === 'stores' ? ' active' : ''}`}
            type="button"
            onClick={() => setEntityTab('stores')}
          >
            Stores
            <span className="nav-tab-count">{pendingStoreCount} pending</span>
          </button>
        </nav>

        <section className="hero">
          <span className="kicker">Moderation dashboard</span>
          <h1>Review every restaurant and store, approve pending records, and edit the full listing in one place.</h1>
          <p>
            Switch between <strong>Restaurants</strong> and <strong>Stores</strong> using the tabs above. Each tab
            shows records where <strong>isapproved</strong> is false by default. Open any card to edit the core
            record plus opening hours, media assets{entityTab === 'restaurants' ? ', and reviews' : ''}.
          </p>
        </section>

        {entityTab === 'restaurants' ? (
          <>
            <section className="topbar" style={{ marginTop: 0 }}>
              <div className="search-row">
                <input
                  type="text"
                  value={restaurantSearch}
                  onChange={(event) => setRestaurantSearch(event.target.value)}
                  placeholder="Search by name, city, area, slug, or Google place id"
                  style={{ minWidth: 280, width: 'min(520px, 100%)' }}
                />
                <button
                  className={restaurantFilter === 'approved' ? 'button' : 'button-ghost'}
                  type="button"
                  onClick={() => setRestaurantFilter('approved')}
                >
                  Approved ({approvedRestaurantCount})
                </button>
                <button
                  className={restaurantFilter === 'pending' ? 'button' : 'button-ghost'}
                  type="button"
                  onClick={() => setRestaurantFilter('pending')}
                >
                  Pending ({pendingRestaurantCount})
                </button>
              </div>

              <div className="search-row">
                <span className="count-pill">Pending: {pendingRestaurantCount}</span>
                <span className="count-pill">Approved: {approvedRestaurantCount}</span>
                <button className="button-ghost" type="button" onClick={() => setRestaurantReloadCount((current) => current + 1)}>
                  Refresh list
                </button>
              </div>
            </section>

            <section className="stats-grid">
              <div className="card stat">
                <span className="small">Loaded restaurants</span>
                <strong>{restaurants.length}</strong>
                <span className="meta">Current filter: {restaurantFilter === 'approved' ? 'approved restaurants' : 'pending restaurants'}</span>
              </div>
              <div className="card stat">
                <span className="small">Pending review</span>
                <strong>{pendingRestaurantCount}</strong>
                <span className="meta">These records still need an approval click.</span>
              </div>
              <div className="card stat">
                <span className="small">Approved</span>
                <strong>{approvedRestaurantCount}</strong>
                <span className="meta">Records already marked as approved.</span>
              </div>
            </section>

            {restaurantsError ? <div className="error-box">{restaurantsError}</div> : null}

            <section className="panel section">
              <div className="section-head">
                <div>
                  <span className="kicker">Restaurants</span>
                  <h2>Restaurant queue</h2>
                  <p>Click a restaurant to inspect and edit every connected table.</p>
                </div>
              </div>

              {restaurantsLoading ? <div className="helper-box">Loading restaurants...</div> : null}

              {!restaurantsLoading && filteredRestaurants.length === 0 ? (
                <div className="helper-box">No restaurants matched the current filter.</div>
              ) : null}

              <div className="restaurant-list">
                {filteredRestaurants.map((restaurant) => {
                  const isApproved = restaurant.isapproved === true;
                  const isSaving = savingRestaurantId === restaurant.id;

                  return (
                    <article
                      key={restaurant.id}
                      className="restaurant-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/restaurants/${restaurant.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          router.push(`/restaurants/${restaurant.id}`);
                        }
                      }}
                    >
                      <div>
                        <div className="item-title">
                          <h3>{restaurant.name}</h3>
                          <span className={`status ${isApproved ? 'status-approved' : 'status-pending'}`}>
                            {isApproved ? 'Approved' : 'Pending approval'}
                          </span>
                          {restaurant.is_active ? <span className="status status-active">Active</span> : null}
                        </div>

                        <div className="meta-row">
                          {restaurantLocation(restaurant) ? <span className="chip">{restaurantLocation(restaurant)}</span> : null}
                          {restaurant.slug ? <span className="chip">/{restaurant.slug}</span> : null}
                          {restaurant.phone ? <span className="chip">{restaurant.phone}</span> : null}
                          {restaurant.google_place_id ? <span className="chip">Google place id</span> : null}
                        </div>

                        <p className="meta" style={{ marginTop: 12 }}>
                          {restaurant.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="stack" style={{ minWidth: 220 }}>
                        <button className="button" type="button" onClick={(event) => { event.stopPropagation(); void handleApproveRestaurant(restaurant.id); }} disabled={isApproved || isSaving}>
                          {isSaving ? 'Saving...' : isApproved ? 'Already approved' : 'Approve'}
                        </button>
                        <button className="button-ghost" type="button" onClick={() => router.push(`/restaurants/${restaurant.id}`)}>
                          Open details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="search-row" style={{ marginBottom: 4 }}>
              <button
                className={storeViewMode === 'queue' ? 'button' : 'button-ghost'}
                type="button"
                onClick={() => setStoreViewMode('queue')}
              >
                Scraped queue
              </button>
              <button
                className={storeViewMode === 'live' ? 'button' : 'button-ghost'}
                type="button"
                onClick={() => setStoreViewMode('live')}
              >
                Live production ({liveStores.length})
              </button>
            </div>

            {storeViewMode === 'queue' ? (
              <>
            <section className="topbar" style={{ marginTop: 0 }}>
              <div className="search-row">
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(event) => setStoreSearch(event.target.value)}
                  placeholder="Search by name, city, area, slug, or Google place id"
                  style={{ minWidth: 280, width: 'min(520px, 100%)' }}
                />
                <button
                  className={storeFilter === 'approved' ? 'button' : 'button-ghost'}
                  type="button"
                  onClick={() => setStoreFilter('approved')}
                >
                  Approved ({approvedStoreCount})
                </button>
                <button
                  className={storeFilter === 'pending' ? 'button' : 'button-ghost'}
                  type="button"
                  onClick={() => setStoreFilter('pending')}
                >
                  Pending ({pendingStoreCount})
                </button>
              </div>

              <div className="search-row">
                <span className="count-pill">Pending: {pendingStoreCount}</span>
                <span className="count-pill">Approved: {approvedStoreCount}</span>
                <button className="button-ghost" type="button" onClick={() => setStoreReloadCount((current) => current + 1)}>
                  Refresh list
                </button>
              </div>
            </section>

            <section className="stats-grid">
              <div className="card stat">
                <span className="small">Loaded stores</span>
                <strong>{stores.length}</strong>
                <span className="meta">Current filter: {storeFilter === 'approved' ? 'approved stores' : 'pending stores'}</span>
              </div>
              <div className="card stat">
                <span className="small">Pending review</span>
                <strong>{pendingStoreCount}</strong>
                <span className="meta">These records still need an approval click.</span>
              </div>
              <div className="card stat">
                <span className="small">Approved</span>
                <strong>{approvedStoreCount}</strong>
                <span className="meta">Records already marked as approved.</span>
              </div>
            </section>

            {storesError ? <div className="error-box">{storesError}</div> : null}

            <section className="panel section">
              <div className="section-head">
                <div>
                  <span className="kicker">Stores</span>
                  <h2>Store queue</h2>
                  <p>Click a store to inspect and edit every connected table.</p>
                </div>
              </div>

              {storesLoading ? <div className="helper-box">Loading stores...</div> : null}

              {!storesLoading && filteredStores.length === 0 ? <div className="helper-box">No stores matched the current filter.</div> : null}

              <div className="restaurant-list">
                {filteredStores.map((store) => {
                  const isApproved = store.isapproved === true;
                  const isSaving = savingStoreId === store.id;

                  return (
                    <article
                      key={store.id}
                      className="restaurant-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/stores/${store.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          router.push(`/stores/${store.id}`);
                        }
                      }}
                    >
                      <div>
                        <div className="item-title">
                          <h3>{store.name}</h3>
                          <span className={`status ${isApproved ? 'status-approved' : 'status-pending'}`}>
                            {isApproved ? 'Approved' : 'Pending approval'}
                          </span>
                          {store.is_active ? <span className="status status-active">Active</span> : null}
                        </div>

                        <div className="meta-row">
                          {storeLocation(store) ? <span className="chip">{storeLocation(store)}</span> : null}
                          {store.slug ? <span className="chip">/{store.slug}</span> : null}
                          {store.category ? <span className="chip">{store.category}</span> : null}
                          {store.phone ? <span className="chip">{store.phone}</span> : null}
                          {store.google_place_id ? <span className="chip">Google place id</span> : null}
                        </div>

                        <p className="meta" style={{ marginTop: 12 }}>
                          {store.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="stack" style={{ minWidth: 220 }}>
                        <button className="button" type="button" onClick={(event) => { event.stopPropagation(); void handleApproveStore(store.id); }} disabled={isApproved || isSaving}>
                          {isSaving ? 'Saving...' : isApproved ? 'Already approved' : 'Approve'}
                        </button>
                        <button className="button-ghost" type="button" onClick={() => router.push(`/stores/${store.id}`)}>
                          Open details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
              </>
            ) : (
              <>
                <section className="topbar" style={{ marginTop: 0 }}>
                  <div className="search-row">
                    <input
                      type="text"
                      value={liveStoreSearch}
                      onChange={(event) => setLiveStoreSearch(event.target.value)}
                      placeholder="Search by name, city, location, slug, or category"
                      style={{ minWidth: 280, width: 'min(520px, 100%)' }}
                    />
                  </div>

                  <div className="search-row">
                    <span className="count-pill">Live stores: {liveStores.length}</span>
                    <button className="button-ghost" type="button" onClick={() => setLiveStoreReloadCount((current) => current + 1)}>
                      Refresh list
                    </button>
                  </div>
                </section>

                {liveStoresError ? <div className="error-box">{liveStoresError}</div> : null}

                <section className="panel section">
                  <div className="section-head">
                    <div>
                      <span className="kicker">Live production</span>
                      <h2>Stores already on PassPrivé</h2>
                      <p>These rows are already live in the second database. Click one to edit its core details and opening hours directly.</p>
                    </div>
                  </div>

                  {liveStoresLoading ? <div className="helper-box">Loading live stores...</div> : null}

                  {!liveStoresLoading && filteredLiveStores.length === 0 ? (
                    <div className="helper-box">No live stores matched the current search.</div>
                  ) : null}

                  <div className="restaurant-list">
                    {filteredLiveStores.map((store) => (
                      <article
                        key={store.id}
                        className="restaurant-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/stores/live/${store.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/stores/live/${store.id}`);
                          }
                        }}
                      >
                        <div>
                          <div className="item-title">
                            <h3>{store.name}</h3>
                            <span className={`status ${store.is_active ? 'status-approved' : 'status-pending'}`}>
                              {store.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {store.is_featured ? <span className="status status-active">Featured</span> : null}
                          </div>

                          <div className="meta-row">
                            {liveStoreLocation(store) ? <span className="chip">{liveStoreLocation(store)}</span> : null}
                            {store.slug ? <span className="chip">/{store.slug}</span> : null}
                            {store.category ? <span className="chip">{store.category}</span> : null}
                            {store.phone ? <span className="chip">{store.phone}</span> : null}
                          </div>

                          <p className="meta" style={{ marginTop: 12 }}>
                            {store.description || 'No description provided.'}
                          </p>
                        </div>

                        <div className="stack" style={{ minWidth: 220 }}>
                          <button className="button-ghost" type="button" onClick={() => router.push(`/stores/live/${store.id}`)}>
                            Open details
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
