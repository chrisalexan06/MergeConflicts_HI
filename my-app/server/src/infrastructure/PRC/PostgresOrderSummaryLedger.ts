import type { Pool } from 'pg';
import type { OrderSummary } from '../../domain/PRC/OrderSummary.js';

export interface OrderSummaryLedgerEntry {
  orderId: string;
  orderStatus: string;
  customerId: string;
  restaurantId: string;
  courierId: string | null;
  placedAt: string;
  deliveredAt: string;
  subtotal: number;
  total: number;
  lines: OrderSummary['lines'];
  breakdown: OrderSummary['breakdown'];
}

export class PostgresOrderSummaryLedger {
  constructor(private readonly db: Pool) {}

  async record(summary: OrderSummary): Promise<void> {
    await this.db.query(
      `INSERT INTO public.order_summary_ledger
         (order_id, order_status, customer_id, restaurant_id, courier_id,
          placed_at, delivered_at, subtotal, total, lines, breakdown)
       SELECT o.order_id, o."orderStatus", o."customerID", o."restaurantID",
              $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb
       FROM public.orders o
       WHERE o.order_id = $1
       ON CONFLICT (order_id) DO NOTHING`,
      [
        summary.orderId,
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

  async listByCustomer(customerId: string): Promise<OrderSummaryLedgerEntry[]> {
    return this.queryEntries('WHERE customer_id = $1', [customerId]);
  }

  async listByRestaurant(restaurantId: string): Promise<OrderSummaryLedgerEntry[]> {
    return this.queryEntries('WHERE restaurant_id = $1', [restaurantId]);
  }

  async listByCourier(courierId: string): Promise<OrderSummaryLedgerEntry[]> {
    return this.queryEntries('WHERE courier_id = $1', [courierId]);
  }

  async listAll(): Promise<OrderSummaryLedgerEntry[]> {
    return this.queryEntries('');
  }

  private async queryEntries(
    whereClause: string,
    values: string[] = [],
  ): Promise<OrderSummaryLedgerEntry[]> {
    const result = await this.db.query<OrderSummaryLedgerEntry>(
      `SELECT order_id::text AS "orderId",
              order_status AS "orderStatus",
              customer_id::text AS "customerId",
              restaurant_id::text AS "restaurantId",
              courier_id::text AS "courierId",
              placed_at::text AS "placedAt",
              delivered_at::text AS "deliveredAt",
              subtotal::float8 AS subtotal,
              total::float8 AS total,
              lines,
              breakdown
       FROM public.order_summary_ledger
       ${whereClause}
       ORDER BY delivered_at DESC, order_id DESC`,
      values,
    );

    return result.rows;
  }
}