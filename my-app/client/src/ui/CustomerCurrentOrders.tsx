import { useState } from "react";
import type { Order } from "../types/order";

interface CustomerCurrentOrdersProps {
  orders: Order[];
  onTrackOrder(orderId: number): void;
  onCancelOrder(orderId: number): Promise<void>;
}

export function CustomerCurrentOrders({ orders, onTrackOrder, onCancelOrder }: CustomerCurrentOrdersProps) {
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
    <section className="card">
      <h2 className="page-title">Your orders</h2>

      {orders.length === 0 ? (
        <p className="muted">You have no orders yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Restaurant</th>
                <th scope="col">Placed</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
                <th scope="col" className="col-status">Status</th>
                <th scope="col" className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const total = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
                return (
                  <tr key={order.orderId}>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        aria-label={`Track order ${order.orderId}`}
                        onClick={() => onTrackOrder(order.orderId)}
                      >
                        #{order.orderId}
                      </button>
                    </td>
                    <td>{order.restaurantId}</td>
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                    <td>
                      {order.items.map((item, i) => (
                        <div key={`${item.itemName}-${i}`}>
                          {item.quantity} x {item.itemName}
                        </div>
                      ))}
                    </td>
                    <td>${total.toFixed(2)}</td>
                    <td className="col-status">
                      <span className={`badge badge-${order.orderStatus}`}>
                        {order.orderStatus === 'cancelled' ? 'Cancelled' : order.orderStatus}
                      </span>
                    </td>
                    <td className="col-actions">
                      {order.orderStatus === "placed" && (
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={cancellingId === order.orderId}
                            onClick={() => void cancel(order.orderId)}
                          >
                            {cancellingId === order.orderId ? "Cancelling..." : "Cancel order"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {message && <div role="status" aria-live="polite" className="alert alert-error">{message}</div>}
    </section>
  );
}