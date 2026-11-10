import type { Pool } from 'pg';
import type { Order } from '../../domain/ORD/Order.js';
import type { OrderSummary } from '../../domain/PRC/OrderSummary.js';

export class PostgresOrderRefundStore {
  constructor(private readonly db: Pool) {}

  async refundDeliveredOrder(order: Order, summary: OrderSummary): Promise<boolean> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const update = await client.query(
        `UPDATE public.orders
         SET "orderStatus" = 'refunded', updated_at = $2
         WHERE order_id = $1 AND "orderStatus" = 'delivered'
         RETURNING order_id`,
        [order.id, order.updatedAt],
      );

      if (update.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query(
        `INSERT INTO public.order_summary_ledger
           (order_id, entry_type, amount, order_status, customer_id,
            restaurant_id, courier_id, placed_at, delivered_at,
            subtotal, total, lines, breakdown)
         VALUES ($1, 'charge', $2, 'delivered', $3, $4, $5, $6, $7,
                 $8, $2, $9::jsonb, $10::jsonb)
         ON CONFLICT (order_id) WHERE entry_type = 'charge' DO NOTHING`,
        [
          order.id,
          summary.total,
          order.customerId,
          order.restaurantId,
          summary.courierId,
          summary.placedAt,
          summary.deliveredAt,
          summary.subtotal,
          JSON.stringify(summary.lines),
          JSON.stringify(summary.breakdown),
        ],
      );

      await client.query(
        `INSERT INTO public.order_summary_ledger
           (order_id, entry_type, amount, order_status, customer_id,
            restaurant_id, courier_id, placed_at, delivered_at,
            subtotal, total, lines, breakdown)
         SELECT order_id, 'refund', -amount, 'refunded', customer_id,
                restaurant_id, courier_id, placed_at, delivered_at,
                subtotal, total, lines, breakdown
         FROM public.order_summary_ledger
         WHERE order_id = $1 AND entry_type = 'charge'
         ON CONFLICT (order_id) WHERE entry_type = 'refund' DO NOTHING`,
        [order.id],
      );

      const refundEvent = order.transitionEvents.at(-1);
      if (!refundEvent) {
        throw new Error('Refund status transition event was not recorded.');
      }

      await client.query(
        `INSERT INTO public.order_events
           (order_id, event_type, from_status, to_status, event_timestamp)
         VALUES ($1, 'status_transition', 'delivered', 'refunded', $2)`,
        [order.id, refundEvent.occurredAt],
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Refund failed and its transaction could not be rolled back.',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}