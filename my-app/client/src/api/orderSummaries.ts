import { readJsonResponse } from './readJsonResponse';

const ORDER_SUMMARIES_URL = '/api/order-summaries';

export interface CourierOrderHistoryEntry {
  ledgerEntryId: string;
  entryType: 'charge' | 'refund';
  orderId: string;
  orderStatus: string;
  restaurantId: string;
  placedAt: string;
  deliveredAt: string;
  total: number;
  lines: Array<{
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
  }>;
}

export async function getOrderSummary(token: string, orderId: string): Promise<void> {
  const response = await fetch(
    `${ORDER_SUMMARIES_URL}/${encodeURIComponent(orderId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Order summary request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
}

export async function listCourierOrderHistory(
  token: string,
): Promise<CourierOrderHistoryEntry[]> {
  const response = await fetch(`${ORDER_SUMMARIES_URL}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJsonResponse(response, 'Order history request');
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Order history request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) {
    throw new Error('Order history request returned an invalid response.');
  }
  return body as CourierOrderHistoryEntry[];
}
