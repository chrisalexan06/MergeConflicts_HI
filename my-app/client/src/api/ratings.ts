import { readJsonResponse } from './readJsonResponse';

const RATINGS_URL = 'http://localhost:3000/api/ratings';

export interface CustomerOrderRating {
  orderId: number;
  restaurantRating: number;
  courierRating: number;
}

export interface RestaurantRatingSummary {
  restaurantId: number;
  averageRating: number;
  ratingCount: number;
}

export interface CourierRatingSummary {
  averageRating: number | null;
  ratingCount: number;
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RATINGS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await readJsonResponse(response, 'Rating request');
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Rating request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

export function listRestaurantRatingSummaries(): Promise<RestaurantRatingSummary[]> {
  return request<RestaurantRatingSummary[]>('/restaurants');
}

export function listMyRatings(token: string): Promise<CustomerOrderRating[]> {
  return request<CustomerOrderRating[]>('/mine', token);
}

export function getMyCourierRatingSummary(token: string): Promise<CourierRatingSummary> {
  return request<CourierRatingSummary>('/courier/me', token);
}

export function submitOrderRating(
  token: string,
  orderId: number,
  restaurantRating: number,
  courierRating: number,
): Promise<CustomerOrderRating> {
  return request<CustomerOrderRating>(`/orders/${orderId}`, token, {
    method: 'POST',
    body: JSON.stringify({ restaurantRating, courierRating }),
  });
}
