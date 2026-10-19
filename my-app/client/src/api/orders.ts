import type { Order, PlaceOrderRequest } from "../types/order";

const ORDERS_URL = "http://localhost:3000/api/orders";

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ORDERS_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      && typeof body.error === "string"
      ? body.error
      : `Order request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

export function listCustomerOrders(token: string): Promise<Order[]> {
  return request<Order[]>(token, "");
}

export function getCustomerOrder(token: string, orderId: number): Promise<Order> {
	return request<Order>(token, `/${orderId}`);
}

export function placeOrder(token: string, order: PlaceOrderRequest): Promise<Order> {
  return request<Order>(token, "", { method: "POST", body: JSON.stringify(order) });
}

export function cancelOrder(token: string, orderId: number): Promise<Order> {
  return request<Order>(token, `/${orderId}/cancel`, { method: "POST" });
}

export function listRestaurantOrders(token: string): Promise<Order[]> {
  return request<Order[]>(token, "/restaurant");
}

export type RestaurantOrderAction = "accept" | "preparing" | "ready" | "cancel";

export function updateRestaurantOrder(
  token: string,
  orderId: number,
  action: RestaurantOrderAction,
): Promise<Order> {
  return request<Order>(token, `/restaurant/${orderId}/${action}`, { method: "POST" });
}

export type { Order, OrderStatus } from "../types/order";