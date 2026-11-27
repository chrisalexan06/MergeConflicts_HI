import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cancelOrder, getCustomerOrder, listCustomerOrders, placeOrder } from '../api/orders';
import { getCustomerProfile, saveCustomerProfile, type CustomerProfile } from '../api/customerProfile';
import {
  listMyRatings,
  listRestaurantRatingSummaries,
  submitOrderRating,
  type CustomerOrderRating,
  type RestaurantRatingSummary,
} from '../api/ratings';
import { readJsonResponse } from '../api/readJsonResponse';
import { CustomerCurrentOrders } from '../ui/CustomerCurrentOrders';
import type { Order } from '../types/order';

interface MenuItem {
  itemId: number;
  itemName: string;
  price: number;
  status: 'available' | 'sold_out';
}

interface Restaurant {
  restaurantId: number;
  restaurantName: string;
  status: 'open' | 'paused' | 'closed';
  latitude: number;
  longitude: number;
  menu: {
    items: MenuItem[];
  };
  averageRating: number | null;
  ratingCount: number;
}

interface CustomerOrdersProps {
  token: string;
}

const emptyCustomerProfile: CustomerProfile = { deliveryAddress: '', city: '', country: '' };
type CustomerView = 'browse' | 'order' | 'current' | 'history';

const historicalOrderStatuses = new Set<Order['orderStatus']>([
  'delivered',
  'completed',
  'cancelled',
  'refunded',
]);

export default function CustomerOrders({ token }: CustomerOrdersProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const view: CustomerView = requestedView === 'order'
    || requestedView === 'current'
    || requestedView === 'history'
    ? requestedView
    : 'browse';
  const setView = (nextView: CustomerView) => setSearchParams({ view: nextView });
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerRatings, setCustomerRatings] = useState<Record<number, CustomerOrderRating>>({});
  const [restaurantRatingSummaries, setRestaurantRatingSummaries] = useState<Record<number, RestaurantRatingSummary>>({});
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [restaurantRatingsError, setRestaurantRatingsError] = useState<string | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState('');
  const [trackingOrder, setTrackingOrder] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [savedCustomerProfile, setSavedCustomerProfile] = useState<CustomerProfile | null>(null);
  const [loadedProfileToken, setLoadedProfileToken] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileLoading = loadedProfileToken !== token;
  const profileComplete = Boolean(
    customerProfile.deliveryAddress.trim()
    && customerProfile.city.trim()
    && customerProfile.country.trim()
  );
  const profileIsSaved = profileComplete
    && savedCustomerProfile?.deliveryAddress === customerProfile.deliveryAddress.trim()
    && savedCustomerProfile.city === customerProfile.city.trim()
    && savedCustomerProfile.country === customerProfile.country.trim();

  useEffect(() => {
    let active = true;

    void getCustomerProfile(token)
      .then((profile) => {
        if (active) {
          setCustomerProfile(profile);
          setSavedCustomerProfile(profile);
          setProfileError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setCustomerProfile(emptyCustomerProfile);
          setSavedCustomerProfile(null);
          setProfileError(requestError instanceof Error ? requestError.message : 'Could not load customer profile.');
        }
      })
      .finally(() => {
        if (active) setLoadedProfileToken(token);
      });

    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRestaurants() {
      try {
        const response = await fetch('/api/restaurants', {
          signal: controller.signal,
        });

        const body = await readJsonResponse(response, 'Restaurant API');
        if (!response.ok) {
          const message = typeof body === 'object' && body !== null
            && 'error' in body && typeof body.error === 'string'
            ? body.error
            : `Restaurant API returned HTTP ${response.status}.`;
          throw new Error(message);
        }
        if (!Array.isArray(body)) throw new Error('Restaurant API returned an invalid response.');
        const data = body as Restaurant[];
        setRestaurants(data);
        setSelectedRestaurantId(data[0]?.restaurantId ?? null);
        setRestaurantRatingSummaries(Object.fromEntries(
          data.filter((restaurant) => restaurant.averageRating !== null && restaurant.ratingCount > 0)
            .map((restaurant) => [restaurant.restaurantId, {
              restaurantId: restaurant.restaurantId,
              averageRating: restaurant.averageRating as number,
              ratingCount: restaurant.ratingCount,
            }])
        ));
        setRestaurantRatingsError(null);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load restaurant data.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRestaurants();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    void listMyRatings(token)
      .then((ratings) => {
        if (active) {
          setCustomerRatings(Object.fromEntries(
            ratings.map((rating) => [rating.orderId, rating])
          ));
          setRatingsError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setRatingsError(requestError instanceof Error ? requestError.message : 'Could not load ratings.');
      });
    return () => { active = false; };
  }, [token]);

  async function handleSubmitRating(
    orderId: number,
    restaurantRating: number,
    courierRating: number,
  ): Promise<void> {
    const savedRating = await submitOrderRating(token, orderId, restaurantRating, courierRating);
    setCustomerRatings((current) => ({
      ...current,
      [savedRating.orderId]: savedRating,
    }));
    try {
      const summaries = await listRestaurantRatingSummaries();
      setRestaurantRatingSummaries(Object.fromEntries(
        summaries.map((summary) => [summary.restaurantId, summary])
      ));
      setRestaurantRatingsError(null);
    } catch (requestError) {
      setRestaurantRatingsError(
        requestError instanceof Error ? requestError.message : 'Could not refresh restaurant ratings.'
      );
    }
  }

  useEffect(() => {
    let active = true;
    void listCustomerOrders(token)
      .then((customerOrders) => {
        if (active) {
          setOrders(customerOrders);
          setOrdersError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setOrdersError(requestError instanceof Error ? requestError.message : 'Failed to load orders.');
        }
      });
    return () => { active = false; };
  }, [token]);

  const selectedRestaurant = restaurants.find(
    (restaurant) => restaurant.restaurantId === selectedRestaurantId
  );
  const currentOrders = orders.filter((order) => !historicalOrderStatuses.has(order.orderStatus));
  const historicalOrders = orders.filter((order) => historicalOrderStatuses.has(order.orderStatus));
  const restaurantCannotAcceptOrders = selectedRestaurant?.status === 'paused'
    || selectedRestaurant?.status === 'closed';
  const selectedMenuItems = selectedRestaurant?.menu.items.filter(
    (item) => selectedItems[item.itemId]
  ) ?? [];
  const allSelectedItemsSoldOut = selectedMenuItems.length > 0
    && selectedMenuItems.every((item) => item.status === 'sold_out');
  const selectedItemsContainSoldOutAndAvailable = selectedMenuItems.some(
    (item) => item.status === 'sold_out'
  ) && selectedMenuItems.some((item) => item.status === 'available');
  const placeOrderTooltip = selectedRestaurant?.status === 'paused'
    ? 'This restaurant is paused and is not accepting new orders.'
    : selectedRestaurant?.status === 'closed'
      ? 'This restaurant is closed and is not accepting orders.'
      : allSelectedItemsSoldOut
        ? 'All selected items are sold out.'
        : selectedItemsContainSoldOutAndAvailable
          ? 'Some selected items are sold out. Remove them before placing the order.'
          : selectedMenuItems.length === 0
            ? 'Select at least one menu item before placing your order.'
          : null;

  async function handlePlaceOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileIsSaved) {
      setProfileError('Complete and save your delivery address, city, and country before placing an order.');
      return;
    }
    setPlacingOrder(true);
    setOrderResult(null);

    const orderLines = Object.entries(selectedItems)
      .filter(([, selected]) => selected)
      .map(([itemId]) => ({
        itemId: Number(itemId),
        quantity: Number(quantities[Number(itemId)] ?? 1),
      }));

    try {
      if (selectedRestaurantId === null) {
        setOrderResult('Select a restaurant before placing an order.');
        return;
      }

      const order = await placeOrder(token, { restaurantId: selectedRestaurantId, orderLines });
      setOrderResult(`Order placed successfully. Order ID: ${order.orderId}`);
      try {
        setOrders(await listCustomerOrders(token));
        setOrdersError(null);
      } catch (refreshError) {
        setOrdersError(
          `Order ${order.orderId} was placed, but the order list could not refresh: ${refreshError instanceof Error ? refreshError.message : 'Unable to reload orders.'}`
        );
      }
    } catch (requestError) {
      setOrderResult(
        `Request failed: ${requestError instanceof Error ? requestError.message : 'Unable to place order.'}`
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleSaveCustomerProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileIsSaved) return;
    const profile = {
      deliveryAddress: customerProfile.deliveryAddress.trim(),
      city: customerProfile.city.trim(),
      country: customerProfile.country.trim(),
    };
    if (!profile.deliveryAddress || !profile.city || !profile.country) {
      setProfileError('Enter a delivery address, city, and country.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    try {
      const savedProfile = await saveCustomerProfile(token, profile);
      setCustomerProfile(savedProfile);
      setSavedCustomerProfile(savedProfile);
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : 'Could not save customer profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCancelOrder(orderId: number) {
    const updatedOrder = await cancelOrder(token, orderId);
    setTrackedOrder((current) => current?.orderId === orderId ? updatedOrder : current);
    setOrders((current) => current.map((order) => order.orderId === orderId ? updatedOrder : order));
    try {
      setOrders(await listCustomerOrders(token));
      setOrdersError(null);
    } catch (refreshError) {
      setOrdersError(
        `Order ${orderId} was canceled, but the order list could not refresh: ${refreshError instanceof Error ? refreshError.message : 'Unable to reload orders.'}`
      );
    }
  }

  async function handleTrackOrder(orderId: number) {
    setTrackingOrder(true);
    setTrackingError(null);
    try {
      const order = await getCustomerOrder(token, orderId);
      setTrackedOrder(order);
      setTrackingOrderId(String(order.orderId));
    } catch (requestError) {
      setTrackedOrder(null);
      setTrackingError(requestError instanceof Error ? requestError.message : 'Could not load this order.');
    } finally {
      setTrackingOrder(false);
    }
  }

  async function handleTrackOrderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const orderId = Number(trackingOrderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      setTrackingError('Enter a valid order ID.');
      return;
    }
    await handleTrackOrder(orderId);
  }

  return (
    <main>
      {loading && <p className="muted">Loading restaurant data...</p>}
      {error && <div role="alert" className="alert alert-error">Error loading restaurant data: {error}</div>}
      {profileLoading && <p className="muted">Loading your customer profile...</p>}
      {profileError && <div role="alert" className="alert alert-error">{profileError}</div>}

      {!loading && !error && (
        <>
          <header className="page-heading">
            <div>
              <h1 className="page-title">Your Sugar Dash</h1>
            </div>
          </header>
          <nav className="view-tabs" aria-label="Customer pages">
            <button type="button" className={view === 'browse' ? 'view-tab active' : 'view-tab'} aria-current={view === 'browse' ? 'page' : undefined} onClick={() => setView('browse')}>Browse Menus</button>
            <button type="button" className={view === 'order' ? 'view-tab active' : 'view-tab'} aria-current={view === 'order' ? 'page' : undefined} onClick={() => setView('order')}>Place an Order</button>
            <button type="button" className={view === 'current' ? 'view-tab active' : 'view-tab'} aria-current={view === 'current' ? 'page' : undefined} onClick={() => setView('current')}>Current Orders</button>
            <button type="button" className={view === 'history' ? 'view-tab active' : 'view-tab'} aria-current={view === 'history' ? 'page' : undefined} onClick={() => setView('history')}>Order History</button>
          </nav>

          {view === 'browse' && <section className="card">
            <div className="section-heading">
              <div><h2 className="page-title">Restaurants &amp; Menus</h2></div>
              <span className="muted">{restaurants.length} {restaurants.length === 1 ? 'restaurant' : 'restaurants'}</span>
            </div>
            {restaurants.length === 0 ? (
              <p className="muted">No restaurants were returned by the API.</p>
            ) : (
              <div className="restaurant-grid">
                {restaurants.map((restaurant) => (
                  <article key={restaurant.restaurantId} className="sub-card">
                    <div className="sub-card-header">
                      <h3>{restaurant.restaurantName}</h3>
                      <span className={`badge badge-${restaurant.status}`}>{restaurant.status}</span>
                    </div>
                    {restaurantRatingSummaries[restaurant.restaurantId] ? (
                      <p className="muted" aria-label={`Restaurant rating ${restaurantRatingSummaries[restaurant.restaurantId].averageRating} out of 5`}>
                        ★ {restaurantRatingSummaries[restaurant.restaurantId].averageRating.toFixed(1)} / 5
                        {' '}({restaurantRatingSummaries[restaurant.restaurantId].ratingCount} {restaurantRatingSummaries[restaurant.restaurantId].ratingCount === 1 ? 'rating' : 'ratings'})
                      </p>
                    ) : <p className="muted">Not rated yet</p>}
                    {restaurant.menu.items.length === 0 ? (
                      <p className="muted">No menu items.</p>
                    ) : (
                      <table className="menu-table">
                        <tbody>
                          {restaurant.menu.items.map((item) => (
                            <tr key={item.itemId}>
                              <td>{item.itemName}</td>
                              <td>${item.price.toFixed(2)}</td>
                              <td className="col-status">
                                <span className={`badge badge-${item.status}`}>
                                  {item.status.replace('_', ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary restaurant-order-link"
                      onClick={() => {
                        setSelectedRestaurantId(restaurant.restaurantId);
                        setSelectedItems({});
                        setQuantities({});
                        setOrderResult(null);
                        setView('order');
                      }}
                    >
                      Choose this restaurant
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>}

          {view === 'order' && <section className="card">
            <div className="section-heading">
              <div><h2 className="page-title">Build your order</h2></div>
              <button type="button" className="btn btn-secondary" onClick={() => setView('browse')}>Back to menus</button>
            </div>
            <form onSubmit={handleSaveCustomerProfile} className="customer-profile-form">
              <h3>Delivery details</h3>
              <div className="customer-profile-fields">
                <div className="form-row">
                  <label htmlFor="delivery-address">Delivery address</label>
                  <input
                    id="delivery-address"
                    autoComplete="street-address"
                    value={customerProfile.deliveryAddress}
                    onChange={(event) => setCustomerProfile((profile) => ({
                      ...profile,
                      deliveryAddress: event.target.value,
                    }))}
                    disabled={profileLoading || savingProfile}
                    required
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="delivery-city">City</label>
                  <input
                    id="delivery-city"
                    autoComplete="address-level2"
                    value={customerProfile.city}
                    onChange={(event) => setCustomerProfile((profile) => ({
                      ...profile,
                      city: event.target.value,
                    }))}
                    disabled={profileLoading || savingProfile}
                    required
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="delivery-country">Country</label>
                  <input
                    id="delivery-country"
                    autoComplete="country-name"
                    value={customerProfile.country}
                    onChange={(event) => setCustomerProfile((profile) => ({
                      ...profile,
                      country: event.target.value,
                    }))}
                    disabled={profileLoading || savingProfile}
                    required
                  />
                </div>
              </div>
              <div className="customer-profile-save-slot">
                {profileIsSaved ? (
                  <p className="customer-profile-saved" role="status">✓ Delivery details saved</p>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    disabled={profileLoading || savingProfile || !profileComplete}
                  >
                    {savingProfile ? 'Saving delivery details...' : 'Save delivery details'}
                  </button>
                )}
              </div>
            </form>
            {restaurants.length === 0 ? (
              <p className="muted">Ordering is unavailable because no restaurants were loaded.</p>
            ) : (
              <form onSubmit={handlePlaceOrder}>
                <div className="form-row">
                  <label htmlFor="restaurant-select">Restaurant</label>
                  <select
                    id="restaurant-select"
                    value={selectedRestaurantId ?? ''}
                    onChange={(event) => {
                      setSelectedRestaurantId(Number(event.target.value));
                      setSelectedItems({});
                      setQuantities({});
                      setOrderResult(null);
                    }}
                  >
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.restaurantId} value={restaurant.restaurantId}>
                        {restaurant.restaurantName} ({restaurant.status})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRestaurant && (
                  selectedRestaurant.menu.items.length === 0 ? (
                    <p className="muted">No menu items.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Order</th>
                            <th scope="col">Item</th>
                            <th scope="col">Price</th>
                            <th scope="col" className="col-status">Status</th>
                            <th scope="col">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRestaurant.menu.items.map((item) => (
                            <tr key={item.itemId} className={item.status === 'sold_out' ? 'row-soldout' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${item.itemName}`}
                                  checked={selectedItems[item.itemId] ?? false}
                                  onChange={(event) => {
                                    setSelectedItems((current) => ({
                                      ...current,
                                      [item.itemId]: event.target.checked,
                                    }));
                                  }}
                                />
                              </td>
                              <td>{item.itemName}</td>
                              <td>${item.price.toFixed(2)}</td>
                              <td className="col-status">
                                <span className={`badge badge-${item.status}`}>
                                  {item.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="1"
                                  className="qty-input"
                                  aria-label={`Quantity of ${item.itemName}`}
                                  value={quantities[item.itemId] ?? '1'}
                                  onChange={(event) => {
                                    setQuantities((current) => ({
                                      ...current,
                                      [item.itemId]: event.target.value,
                                    }));
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                <span className="place-order-tooltip-wrapper">
                  <button
                    type="submit"
                    className="btn form-submit"
                    aria-describedby={placeOrderTooltip ? 'place-order-tooltip' : undefined}
                    disabled={
                      placingOrder
                      || profileLoading
                      || !profileIsSaved
                      || selectedRestaurantId === null
                      || restaurantCannotAcceptOrders
                      || allSelectedItemsSoldOut
                    }
                  >
                    {placingOrder ? 'Placing order...' : 'Place order'}
                  </button>
                  {placeOrderTooltip && (
                    <span id="place-order-tooltip" role="tooltip" className="place-order-tooltip">
                      {placeOrderTooltip}
                    </span>
                  )}
                </span>
              </form>
            )}
            {orderResult && (
              <div
                role={orderResult.startsWith('Order placed successfully') ? 'status' : 'alert'}
                aria-live={orderResult.startsWith('Order placed successfully') ? 'polite' : 'assertive'}
                className={`alert ${orderResult.startsWith('Order placed') ? 'alert-success' : 'alert-error'}`}
              >
                {orderResult}
              </div>
            )}
          </section>}

          {view === 'current' && <>
          <section className="card" aria-labelledby="track-order-heading">
            <h2 id="track-order-heading" className="page-title">Track an order</h2>
            <form onSubmit={handleTrackOrderSubmit} className="inline-form">
              <input
                id="track-order-id"
                type="number"
                min="1"
                step="1"
                placeholder="Order ID"
                aria-label="Order ID"
                className="qty-input"
                value={trackingOrderId}
                onChange={(event) => setTrackingOrderId(event.target.value)}
              />
              <button type="submit" className="btn" disabled={trackingOrder}>
                {trackingOrder ? 'Loading...' : 'Track order'}
              </button>
            </form>

            {trackingError && <div role="alert" className="alert alert-error">{trackingError}</div>}

            {trackedOrder && (
              <article aria-live="polite" className="sub-card">
                <div className="sub-card-header">
                  <h3>Order #{trackedOrder.orderId}</h3>
                  <span className={`badge badge-${trackedOrder.orderStatus}`}>
                    {trackedOrder.orderStatus}
                  </span>
                </div>
                <p className="muted">
                  {restaurants.find((restaurant) => restaurant.restaurantId === trackedOrder.restaurantId)?.restaurantName
                    ?? `Restaurant #${trackedOrder.restaurantId}`}
                  {' · '}Placed {new Date(trackedOrder.createdAt).toLocaleString()}
                </p>
                {trackedOrder.items.map((item) => (
                  <div key={item.itemId}>{item.quantity} x {item.itemName}</div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary refresh-btn"
                  disabled={trackingOrder}
                  onClick={() => void handleTrackOrder(trackedOrder.orderId)}
                >
                  Refresh status
                </button>
              </article>
            )}
          </section>

          <CustomerCurrentOrders
            orders={currentOrders}
            restaurantNames={Object.fromEntries(
              restaurants.map((restaurant) => [restaurant.restaurantId, restaurant.restaurantName])
            )}
            ratings={customerRatings}
            onTrackOrder={(orderId) => void handleTrackOrder(orderId)}
            onCancelOrder={handleCancelOrder}
            onSubmitRating={handleSubmitRating}
            heading="Current Orders"
            emptyMessage="You have no current orders."
          />
          {ordersError && <div role="alert" className="alert alert-error">Error loading orders: {ordersError}</div>}
          </>}

          {view === 'history' && <>
          <CustomerCurrentOrders
            orders={historicalOrders}
            restaurantNames={Object.fromEntries(
              restaurants.map((restaurant) => [restaurant.restaurantId, restaurant.restaurantName])
            )}
            ratings={customerRatings}
            onTrackOrder={(orderId) => {
              setView('current');
              void handleTrackOrder(orderId);
            }}
            onCancelOrder={handleCancelOrder}
            onSubmitRating={handleSubmitRating}
            heading="Order History"
            emptyMessage="Completed or cancelled orders will appear here."
          />
          {ordersError && <div role="alert" className="alert alert-error">Error loading orders: {ordersError}</div>}
          {ratingsError && <div role="alert" className="alert alert-error">Error loading ratings: {ratingsError}</div>}
          {restaurantRatingsError && <div role="alert" className="alert alert-error">Restaurant ratings unavailable: {restaurantRatingsError}</div>}
          </>}
        </>
      )}
    </main>
  );
}
