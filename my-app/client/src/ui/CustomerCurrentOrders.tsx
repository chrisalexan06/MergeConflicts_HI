import { useState, type FormEvent } from "react";
import type { Order } from "../types/order";
import type { CustomerOrderRating } from "../api/ratings";
import "./CustomerCurrentOrders.css";

interface CustomerCurrentOrdersProps {
  orders: Order[];
  ratings: Record<number, CustomerOrderRating>;
  onTrackOrder(orderId: number): void;
  onCancelOrder(orderId: number): Promise<void>;
  onSubmitRating(orderId: number, restaurantRating: number, courierRating: number): Promise<void>;
}

interface StarRatingProps {
  label: string;
  value: number | null;
  onChange(value: number): void;
  disabled: boolean;
  messages: string[];
}

function StarRating({ label, value, onChange, disabled, messages }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const activeValue = hoverValue ?? value;

  return (
    <div className="star-rating-control">
      <div className="star-rating" role="group" aria-label={label} onMouseLeave={() => setHoverValue(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-rating-button${activeValue !== null && star <= activeValue ? ' is-selected' : ''}`}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}: ${messages[star - 1]}`}
            aria-pressed={value === star}
            onMouseEnter={() => setHoverValue(star)}
            onFocus={() => setHoverValue(star)}
            onBlur={() => setHoverValue(null)}
            onClick={() => onChange(star)}
            disabled={disabled}
          >
            &#9733;
          </button>
        ))}
      </div>
      <span className="star-rating-message" aria-live="polite">
        {activeValue === null ? '' : messages[activeValue - 1]}
      </span>
    </div>
  );
}

export function CustomerCurrentOrders({ orders, ratings, onTrackOrder, onCancelOrder, onSubmitRating }: CustomerCurrentOrdersProps) {
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
                      {order.orderStatus === 'delivered' && (
                        <OrderRatingForm
                          orderId={order.orderId}
                          rating={ratings[order.orderId]}
                          onSubmit={onSubmitRating}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {message && <div role="alert" aria-live="assertive" className="alert alert-error">{message}</div>}
    </section>
  );
}

interface OrderRatingFormProps {
  orderId: number;
  rating?: CustomerOrderRating;
  onSubmit(orderId: number, restaurantRating: number, courierRating: number): Promise<void>;
}

function OrderRatingForm({ orderId, rating, onSubmit }: OrderRatingFormProps) {
  const [restaurantRating, setRestaurantRating] = useState<number | null>(null);
  const [courierRating, setCourierRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (rating !== undefined) {
    return (
      <span aria-label={`Restaurant rated ${rating.restaurantRating} out of 5; courier rated ${rating.courierRating} out of 5`}>
        Restaurant ★ {rating.restaurantRating}/5<br />Courier ★ {rating.courierRating}/5
      </span>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restaurantRating === null || courierRating === null) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit(orderId, restaurantRating, courierRating);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not submit your rating.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="order-rating-form" onSubmit={(event) => void submit(event)}>
      <span className="rating-field-label">Restaurant</span>
      <StarRating
        label={`Rate restaurant for order ${orderId}`}
        value={restaurantRating}
        onChange={setRestaurantRating}
        disabled={saving}
        messages={['Poor', 'Fair', 'Good', 'Very good', 'Excellent']}
      />
      <span className="rating-field-label">Courier</span>
      <StarRating
        label={`Rate courier for order ${orderId}`}
        value={courierRating}
        onChange={setCourierRating}
        disabled={saving}
        messages={['Poor', 'Fair', 'Good', 'Very good', 'Excellent']}
      />
      <button className="btn btn-secondary" type="submit" disabled={saving || restaurantRating === null || courierRating === null}>
        {saving ? 'Saving...' : 'Submit'}
      </button>
      {error && <span className="alert alert-error" role="alert">{error}</span>}
    </form>
  );
}
