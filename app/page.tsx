'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveRestaurant, fetchRestaurants, fetchApprovedCount, fetchPendingCount, Restaurant } from '@/lib/dashboard';

function restaurantLocation(restaurant: Restaurant) {
  return [restaurant.area, restaurant.city, restaurant.country].filter(Boolean).join(' · ');
}

export default function HomePage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'pending' | 'approved'>('pending');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [approvedCountGlobal, setApprovedCountGlobal] = useState(0);
  const [pendingCountGlobal, setPendingCountGlobal] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [data, approvedCount, pendingCount] = await Promise.all([
          fetchRestaurants(activeFilter === 'approved'),
          fetchApprovedCount(),
          fetchPendingCount()
        ]);
        if (active) {
          setRestaurants(data);
          setApprovedCountGlobal(approvedCount);
          setPendingCountGlobal(pendingCount);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load restaurants');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [activeFilter, reloadCount]);

  const filteredRestaurants = useMemo(() => {
    const term = search.trim().toLowerCase();
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
  }, [restaurants, search]);

  const approvedCount = approvedCountGlobal;
  const pendingCount = pendingCountGlobal;

  async function handleApprove(restaurantId: string) {
    setSavingId(restaurantId);

    try {
      await approveRestaurant(restaurantId, true);
      setReloadCount((current) => current + 1);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Failed to approve restaurant');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main>
      <div className="shell">
        <section className="hero">
          <span className="kicker">Restaurant moderation dashboard</span>
          <h1>Review every restaurant, approve pending records, and edit the full listing in one place.</h1>
          <p>
            The home page shows restaurants where <strong>isapproved</strong> is false. Open any card to edit the core
            restaurant record plus opening hours, media assets, and reviews.
          </p>

          <div className="topbar">
            <div className="search-row">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, city, area, slug, or Google place id"
                style={{ minWidth: 280, width: 'min(520px, 100%)' }}
              />
              <button
                className={activeFilter === 'approved' ? 'button' : 'button-ghost'}
                type="button"
                onClick={() => setActiveFilter('approved')}
              >
                Approved ({approvedCount})
              </button>
              <button
                className={activeFilter === 'pending' ? 'button' : 'button-ghost'}
                type="button"
                onClick={() => setActiveFilter('pending')}
              >
                Pending ({pendingCount})
              </button>
            </div>

            <div className="search-row">
              <span className="count-pill">Pending: {pendingCount}</span>
              <span className="count-pill">Approved: {approvedCount}</span>
              <button className="button-ghost" type="button" onClick={() => setReloadCount((current) => current + 1)}>
                Refresh list
              </button>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <div className="card stat">
            <span className="small">Loaded restaurants</span>
            <strong>{restaurants.length}</strong>
            <span className="meta">Current filter: {activeFilter === 'approved' ? 'approved restaurants' : 'pending restaurants'}</span>
          </div>
          <div className="card stat">
            <span className="small">Pending review</span>
            <strong>{pendingCount}</strong>
            <span className="meta">These records still need an approval click.</span>
          </div>
          <div className="card stat">
            <span className="small">Approved</span>
            <strong>{approvedCount}</strong>
            <span className="meta">Records already marked as approved.</span>
          </div>
        </section>

        {error ? <div className="error-box">{error}</div> : null}

        <section className="panel section">
          <div className="section-head">
            <div>
              <span className="kicker">Home page</span>
              <h2>Restaurant queue</h2>
              <p>Click a restaurant to inspect and edit every connected table.</p>
            </div>
          </div>

          {loading ? <div className="helper-box">Loading restaurants...</div> : null}

          {!loading && filteredRestaurants.length === 0 ? (
            <div className="helper-box">No restaurants matched the current filter.</div>
          ) : null}

          <div className="restaurant-list">
            {filteredRestaurants.map((restaurant) => {
              const isApproved = restaurant.isapproved === true;
              const isSaving = savingId === restaurant.id;

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
                    <button className="button" type="button" onClick={(event) => { event.stopPropagation(); void handleApprove(restaurant.id); }} disabled={isApproved || isSaving}>
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
      </div>
    </main>
  );
}
