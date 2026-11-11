const ORDER_SUMMARIES_URL = 'http://localhost:3000/api/order-summaries';

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
