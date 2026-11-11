const OPERATOR_URL = 'http://localhost:3000/api/operator';
const ORDER_SUMMARIES_URL = 'http://localhost:3000/api/order-summaries';

export type OperatorRestaurantStatus = 'open' | 'paused';

export interface OperatorOrder {
  orderId: number;
  status: string;
  customerId: number;
  customerName: string | null;
  restaurantId: number;
  restaurantName: string | null;
  courierId: number | null;
  courierName: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    itemId: number;
    itemName: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export async function getOperatorOrders(token: string): Promise<OperatorOrder[]> {
  const response = await fetch(`${OPERATOR_URL}/orders`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Order list request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) {
    throw new Error('All-orders request returned an invalid response.');
  }
  return body as OperatorOrder[];
}

export interface OperatorLedgerEntry {
  ledgerEntryId: string;
  entryType: 'charge' | 'refund';
  amount: number;
  orderId: string;
  orderStatus: string;
  customerId: string;
  restaurantId: string;
  courierId: string | null;
  placedAt: string;
  deliveredAt: string;
  subtotal: number;
  total: number;
  lines: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
  }>;
  breakdown: Array<{ name: string; amount: number }>;
}

export async function getOperatorLedgerHistory(token: string): Promise<OperatorLedgerEntry[]> {
  const response = await fetch(`${ORDER_SUMMARIES_URL}/history`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Ledger history request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) {
    throw new Error('Ledger history returned an invalid response.');
  }
  return body as OperatorLedgerEntry[];
}

export async function refundOperatorOrder(token: string, orderId: string): Promise<void> {
  const response = await fetch(
    `${ORDER_SUMMARIES_URL}/${encodeURIComponent(orderId)}/refund`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    }
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Refund request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
}

export async function reassignOperatorOrder(
  token: string,
  orderId: number,
  newCourierId: number,
  confirmedHandoff: boolean
): Promise<{ message: string; orderId: string; courierId: string }> {
  const response = await fetch(
    `${OPERATOR_URL}/delivery/orders/${encodeURIComponent(orderId)}/reassign`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newCourierId, confirmedHandoff }),
    }
  );

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Order reassignment failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (typeof body !== 'object' || body === null || !('message' in body)
    || typeof body.message !== 'string' || !('orderId' in body)
    || typeof body.orderId !== 'string' || !('courierId' in body)
    || typeof body.courierId !== 'string') {
    throw new Error('Order reassignment returned an invalid response.');
  }
  return body as { message: string; orderId: string; courierId: string };
}

export async function updateOperatorRestaurantStatus(
  token: string,
  restaurantId: number,
  status: OperatorRestaurantStatus
): Promise<void> {
  const response = await fetch(
    `${OPERATOR_URL}/restaurants/${encodeURIComponent(restaurantId)}/status`,
    {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    }
  );

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Restaurant status request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
}

export async function restoreInitialState(token: string): Promise<void> {
  const response = await fetch(`${OPERATOR_URL}/reset`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Reset request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
}
