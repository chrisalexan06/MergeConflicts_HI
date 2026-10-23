import React, { useEffect, useState } from 'react';

interface RestaurantOption {
  restaurantId: number;
  restaurantName: string;
}

interface Props {
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export const RegistrationPanel: React.FC<Props> = ({ onSuccess, onError }) => {
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('customer');
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurantLoadError, setRestaurantLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'restaurant') {
      return;
    }

    const controller = new AbortController();
    setRestaurantsLoading(true);
    setRestaurantLoadError(null);

    async function loadRestaurants() {
      try {
        const response = await fetch('http://localhost:3000/api/restaurants', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Could not load restaurants (HTTP ${response.status}).`);
        }

        const availableRestaurants: RestaurantOption[] = await response.json();
        setRestaurants(availableRestaurants);
        setSelectedRestaurantId((currentId) => (
          availableRestaurants.some((restaurant) => String(restaurant.restaurantId) === currentId)
            ? currentId
            : ''
        ));
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setRestaurants([]);
          setSelectedRestaurantId('');
          setRestaurantLoadError(error instanceof Error ? error.message : 'Could not load restaurants.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setRestaurantsLoading(false);
        }
      }
    }

    void loadRestaurants();
    return () => controller.abort();
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: accountName.trim(),
          password,
          email: email.trim(),
          role,
          ...(role === 'restaurant' && {
            extraData: { restaurantID: Number(selectedRestaurantId) },
          }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      onSuccess(`Account successfully registered: ${data.account.accountName} [Role: ${data.account.role}]`);
      setAccountName('');
      setPassword('');
      setEmail('');
      setSelectedRestaurantId('');
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Network request failed');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid #ccc',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '380px',
        backgroundColor: '#fff',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Register New Account</h3>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Username</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. johndoe"
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Email</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. john@example.com"
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Password</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Role</label>
        <select
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="customer">Customer</option>
          <option value="restaurant">Restaurant Staff</option>
          <option value="courier">Courier</option>
          <option value="operator">Operator</option>
        </select>
      </div>

      {role === 'restaurant' && (
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="registration-restaurant" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
            Restaurant
          </label>
          <select
            id="registration-restaurant"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            required
            disabled={restaurantsLoading || restaurants.length === 0}
          >
            <option value="">
              {restaurantsLoading ? 'Loading restaurants...' : 'Select your restaurant'}
            </option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.restaurantId} value={restaurant.restaurantId}>
                {restaurant.restaurantName}
              </option>
            ))}
          </select>
          {restaurantLoadError && <p role="alert">{restaurantLoadError}</p>}
          {!restaurantsLoading && !restaurantLoadError && restaurants.length === 0 && (
            <p role="alert">No restaurants are available for registration.</p>
          )}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-block"
        disabled={role === 'restaurant' && (
          restaurantsLoading || restaurants.length === 0 || !selectedRestaurantId
        )}
      >
        Register
      </button>
    </form>
  );
};