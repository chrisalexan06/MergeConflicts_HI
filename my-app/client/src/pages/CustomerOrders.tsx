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
      <h1>Temporary ORD Review UI</h1>
      {loading && <p>Loading restaurant data...</p>}
      {error && <p role="alert">Error loading restaurant data: {error}</p>}
      {!loading && !error && (
        <>
          <section>
            <h2>R-ORD-01 – Loaded Restaurant Data</h2>
            {restaurants.length === 0 ? (
              <p>No restaurants were returned by the API.</p>
            ) : (
              restaurants.map((restaurant) => (
                <article key={restaurant.restaurantId}>
                  <h3>{restaurant.restaurantName}</h3>
                  <p>Status: {restaurant.status}</p>
                  <p>Latitude: {restaurant.latitude}</p>
                  <p>Longitude: {restaurant.longitude}</p>
                  <h4>Menu</h4>
                  {restaurant.menu.items.length === 0 ? (
                    <p>No menu items.</p>
                  ) : (
                    <ul>
                      {restaurant.menu.items.map((item) => (
                        <li key={item.itemId}>
                          {item.itemName} — ${item.price.toFixed(2)} — {item.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </section>

          <section>
            <h2>R-ORD-02 – Order Placement Test</h2>
            {restaurants.length === 0 ? (
              <p>Order testing is unavailable because no restaurants were loaded.</p>
            ) : (
              <form onSubmit={handlePlaceOrder}>
                <label>
                  Restaurant:
                  <select
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
                </label>

                {selectedRestaurant && (
                  <>
                    <h3>{selectedRestaurant.restaurantName} menu</h3>
                    {selectedRestaurant.menu.items.length === 0 ? (
                      <p>No menu items.</p>
                    ) : (
                      <ul>
                        {selectedRestaurant.menu.items.map((item) => (
                          <li key={item.itemId}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedItems[item.itemId] ?? false}
                                onChange={(event) => {
                                  setSelectedItems((current) => ({
                                    ...current,
                                    [item.itemId]: event.target.checked,
                                  }));
                                }}
                              />
                              {item.itemName} — ${item.price.toFixed(2)} — {item.status}
                            </label>
                            <label>
                              {' '}Quantity:
                              <input
                                type="number"
                                value={quantities[item.itemId] ?? '1'}
                                onChange={(event) => {
                                  setQuantities((current) => ({
                                    ...current,
                                    [item.itemId]: event.target.value,
                                  }));
                                }}
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                <button type="submit" disabled={placingOrder || selectedRestaurantId === null}>
                  {placingOrder ? 'Placing order...' : 'Place Order'}
                </button>
              </form>
            )}
            {orderResult && <p role="status">{orderResult}</p>}
          </section>
          <section aria-labelledby="track-order-heading">
            <h2 id="track-order-heading">Track an order</h2>
            <form onSubmit={handleTrackOrderSubmit}>
              <label htmlFor="track-order-id">Order ID</label>
              <input
                id="track-order-id"
                type="number"
                min="1"
                step="1"
                value={trackingOrderId}
                onChange={(event) => setTrackingOrderId(event.target.value)}
              />
              <button type="submit" disabled={trackingOrder}>
                {trackingOrder ? 'Loading order...' : 'Track order'}
              </button>
            </form>
            {trackingError && <p role="alert">{trackingError}</p>}
            {trackedOrder && (
              <article aria-live="polite">
                <h3>Order {trackedOrder.orderId}</h3>
                <p>Status: {trackedOrder.orderStatus}</p>
                <p>Restaurant: {trackedOrder.restaurantId}</p>
                <p>Placed: {new Date(trackedOrder.createdAt).toLocaleString()}</p>
                <ul>
                  {trackedOrder.items.map((item) => (
                    <li key={item.itemId}>{item.quantity} x {item.itemName}</li>
                  ))}
                </ul>
                <button
                  type="button"
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
          {ordersError && <p role="alert">Error loading orders: {ordersError}</p>}
        </>
      )}
    </main>
  );
}