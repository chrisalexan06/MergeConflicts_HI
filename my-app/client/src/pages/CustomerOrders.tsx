import { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main>
      <h1>Temporary R-ORD-01 Restaurant Data Test</h1>
      {loading && <p>Loading restaurant data...</p>}
      {error && <p role="alert">Error loading restaurant data: {error}</p>}
      {!loading && !error && restaurants.length === 0 && <p>No restaurants were returned by the API.</p>}
      {!loading && !error && restaurants.map((restaurant) => (
        <section key={restaurant.restaurantId}>
          <h2>{restaurant.restaurantName}</h2>
          <p>Status: {restaurant.status}</p>
          <p>Latitude: {restaurant.latitude}</p>
          <p>Longitude: {restaurant.longitude}</p>
          <h3>Menu</h3>
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
        </section>
      ))}
    </main>
  );
}