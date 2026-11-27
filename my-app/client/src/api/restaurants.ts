export interface RestaurantDetails {
  restaurantId: number;
  restaurantName: string;
  status: 'open' | 'paused' | 'closed';
  menuItems: StaffMenuItem[];
  averageRating: number | null;
  ratingCount: number;
}

export interface StaffMenuItem {
  itemId: number;
  itemName: string;
  price: number;
  status: 'available' | 'sold_out';
}

const RESTAURANTS_URL = '/api/restaurants';

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RESTAURANTS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Restaurant request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

export function getMyRestaurant(token: string): Promise<RestaurantDetails> {
  return request<RestaurantDetails>(token, '/me');
}

export function pauseMyRestaurant(token: string): Promise<RestaurantDetails> {
  return request<RestaurantDetails>(token, '/me/pause', { method: 'POST' });
}

export function updateMyMenuItemStatus(
  token: string,
  itemId: number,
  status: StaffMenuItem['status']
): Promise<StaffMenuItem> {
  return request<StaffMenuItem>(
    token,
    `/me/menu-items/${encodeURIComponent(itemId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
}

export function updateMyMenuItemDetails(
  token: string,
  itemId: number,
  details: { name: string; price: number }
): Promise<StaffMenuItem> {
  return request<StaffMenuItem>(
    token,
    `/me/menu-items/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify(details) }
  );
}
