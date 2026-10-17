import { useEffect, useState } from 'react';

const TEST_CUSTOMER_ID = 19;

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

export default function CustomerOrders() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
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
      const response = await fetch('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: TEST_CUSTOMER_ID,
          restaurantId: selectedRestaurantId,
          orderLines,
        }),
      });
      const responseBody: unknown = await response.json();

      if (!response.ok) {
        const message = typeof responseBody === 'object'
          && responseBody !== null
          && 'error' in responseBody
          && typeof responseBody.error === 'string'
          ? responseBody.error
          : `Order request failed with HTTP ${response.status}.`;
        setOrderResult(`Order rejected: ${message}`);
        return;
      }

      if (typeof responseBody === 'object'
        && responseBody !== null
        && 'orderId' in responseBody) {
        setOrderResult(`Order placed successfully. Order ID: ${responseBody.orderId}`);
      } else {
        setOrderResult(`Order placed successfully: ${JSON.stringify(responseBody)}`);
      }
    } catch (requestError) {
      setOrderResult(
        `Request failed: ${requestError instanceof Error ? requestError.message : 'Unable to place order.'}`
      );
    } finally {
      setPlacingOrder(false);
    }
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
            <p>Test customer ID: {TEST_CUSTOMER_ID}</p>
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
        </>
      )}
    </main>
  );
}