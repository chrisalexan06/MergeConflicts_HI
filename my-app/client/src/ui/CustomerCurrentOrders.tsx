import { useState } from "react";
import type { Order } from "../types/order";

interface CustomerCurrentOrdersProps {
  orders: Order[];
  onCancelOrder(orderId: number): Promise<void>;
}

export function CustomerCurrentOrders({ orders, onCancelOrder }: CustomerCurrentOrdersProps) {
  const [message, setMessage] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  async function cancel(orderId: number) {
    setCancellingId(orderId);
    setMessage("");
    try {
      await onCancelOrder(orderId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to cancel the order.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section>
      <h2>Your orders</h2>
      {orders.length === 0 ? (
        <p>You have no orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Restaurant</th>
              <th scope="col">Placed</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const total = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
              return (
                <tr key={order.orderId}>
                  <td>{order.orderId}</td>
                  <td>{order.restaurantId}</td>
                  <td>{new Date(order.createdAt).toLocaleString()}</td>
                  <td>{total.toFixed(2)}</td>
                  <td>{order.orderStatus}</td>
                  <td>
                    {order.orderStatus === "placed" && (
                      <button
                        type="button"
                        disabled={cancellingId === order.orderId}
                        onClick={() => void cancel(order.orderId)}
                      >
                        {cancellingId === order.orderId ? "Cancelling..." : "Cancel order"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p role="status" aria-live="polite">{message}</p>
    </section>
  );
}