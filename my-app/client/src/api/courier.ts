import type { CourierActionResult, CurrentCourier } from '../types/courier';

const COURIERS_URL = 'http://localhost:3000/api/couriers';

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${COURIERS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      && typeof body.error === 'string'
      ? body.error
      : `Courier request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}

export function getCurrentCourier(token: string): Promise<CurrentCourier> {
  return request<CurrentCourier>(token, '/me');
}

export function confirmPickup(token: string, orderId: string): Promise<CourierActionResult> {
  return request<CourierActionResult>(token, `/orders/${encodeURIComponent(orderId)}/pickup`, {
    method: 'POST',
  });
}

export function confirmDelivery(token: string, orderId: string): Promise<CourierActionResult> {
  return request<CourierActionResult>(token, `/orders/${encodeURIComponent(orderId)}/deliver`, {
    method: 'POST',
  });
}