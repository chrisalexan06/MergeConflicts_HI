import { useState, type FormEvent } from "react";
import type { MenuItem, PlaceOrderRequest } from "../types/order";

interface CustomerOrderFormProps {
  restaurantId: number;
  items: MenuItem[];
  onPlaceOrder(request: PlaceOrderRequest): Promise<void>;
}

export function CustomerOrderForm({ restaurantId, items, onPlaceOrder }: CustomerOrderFormProps) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = Object.entries(quantities)
      .map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity }))
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      setMessage("Choose at least one item.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      await onPlaceOrder({ restaurantId, orderLines: lines });
      setQuantities({});
      setMessage("Order placed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to place the order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Place an order</h2>
      {items.map((item) => (
        <label key={item.itemId} htmlFor={`order-item-${item.itemId}`}>
          {item.name} - {item.unitPrice.toFixed(2)}
          {!item.isAvailable && " (Unavailable)"}
          <input
            id={`order-item-${item.itemId}`}
            type="number"
            min="0"
            step="1"
            value={quantities[item.itemId] ?? 0}
            disabled={!item.isAvailable || submitting}
            onChange={(event) => setQuantities({
              ...quantities,
              [item.itemId]: Number(event.target.value),
            })}
          />
        </label>
      ))}
      <button type="submit" disabled={submitting}>
        {submitting ? "Placing order..." : "Place order"}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}