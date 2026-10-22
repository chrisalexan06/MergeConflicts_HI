import { useEffect, useState } from 'react';
import { cancelOrder, getCustomerOrder, listCustomerOrders, placeOrder } from '../api/orders';
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
}

interface CustomerOrdersProps {
  token: string;
}

export default function CustomerOrders({ token }: CustomerOrdersProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadRestaurants() {
      try {
        const response = await fetch('http://localhost:3000/api/test/restaurants', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Restaurant API returned HTTP ${response.status}.`);
        }

        const data: Restaurant[] = await response.json();
        setRestaurants(data);
        setSelectedRestaurantId(data[0]?.restaurantId ?? null);
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
    void listCustomerOrders(token)
      .then((customerOrders) => {
        if (active) setOrders(customerOrders);
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

  async function handlePlaceOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        setOrders(await listCustomerOrders(token));
    } catch (requestError) {
      setOrderResult(
        `Request failed: ${requestError instanceof Error ? requestError.message : 'Unable to place order.'}`
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleCancelOrder(orderId: number) {
    const updatedOrder = await cancelOrder(token, orderId);
    setTrackedOrder((current) => current?.orderId === orderId ? updatedOrder : current);
    setOrders(await listCustomerOrders(token));
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

      {!loading && !error && (
        <>
          //browse restaurants
          <section className="card">
            <h2 className="page-title">Restaurants</h2>
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
                    {restaurant.menu.items.length === 0 ? (
                      <p className="muted">No menu items.</p>
                    ) : (
                      <table>
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
                  </article>
                ))}
              </div>
            )}
          </section>

          //place an order
          <section className="card">
            <h2 className="page-title">Place an order</h2>
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

                <button
                  type="submit"
                  className="btn form-submit"
                  disabled={placingOrder || selectedRestaurantId === null}
                >
                  {placingOrder ? 'Placing order...' : 'Place order'}
                </button>
              </form>
            )}
            {orderResult && (
              <div
                role="status"
                className={`alert ${orderResult.startsWith('Order placed') ? 'alert-success' : 'alert-error'}`}
              >
                {orderResult}
              </div>
            )}
          </section>

          //track order
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
                  Restaurant {trackedOrder.restaurantId} · Placed {new Date(trackedOrder.createdAt).toLocaleString()}
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
            orders={orders}
            onTrackOrder={(orderId) => void handleTrackOrder(orderId)}
            onCancelOrder={handleCancelOrder}
          />
          {ordersError && <div role="alert" className="alert alert-error">Error loading orders: {ordersError}</div>}
        </>
      )}
    </main>
  );
}