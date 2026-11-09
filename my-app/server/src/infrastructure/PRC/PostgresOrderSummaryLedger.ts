import type { Pool } from 'pg';
import type { OrderSummary } from '../../domain/PRC/OrderSummary.js';

export class PostgresOrderSummaryLedger {
  constructor(private readonly db: Pool) {}

  async record(summary: OrderSummary): Promise<void> {
    await this.db.query(
      `INSERT INTO public.order_summary_ledger
         (order_id, order_status, restaurant_id, courier_id, placed_at, delivered_at,
          subtotal, total, lines, breakdown)
       SELECT o.order_id, o."orderStatus", $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb
       FROM public.orders o
       WHERE o.order_id = $1
       ON CONFLICT (order_id) DO NOTHING`,
      [
        summary.orderId,
        summary.restaurantId,
        summary.courierId,
        summary.placedAt,
        summary.deliveredAt,
        summary.subtotal,
        summary.total,
        JSON.stringify(summary.lines),
        JSON.stringify(summary.breakdown),
      ],
    );
  }
}