
import type { Pool, PoolClient } from 'pg';
import { selectNearestCourier } from './CourierSelection.js';
import { parseCoordinates } from './Coordinates.js';

interface QueueEntry {
  queue_entry_id: string;
  order_id: string;
  restaurantID: string;
  restaurantPosition: string;
  orderStatus: string;
}

interface AvailableCourier {
  id: string;
  latitude: number;
  longitude: number;
}

interface PendingOffer {
  courierId: string;
  courierStatus: string;
  hasActiveAssignment: boolean;
}

export class DispatchQueueService {
  constructor(private readonly db: Pool) {}

  async retryPendingOrders(): Promise<{
    offered: number;
    waiting: number;
  }> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // One dispatch worker at a time, even across
      // multiple backend processes
      await client.query(
        'SELECT pg_advisory_xact_lock(42042, 4)'
      );

      // Ensure the dispatch queue exists.
      const queueResult = await client.query<{
        queue_id: number;
      }>(
        `INSERT INTO public.queues (name)
         VALUES ('dispatch')
         ON CONFLICT (name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING queue_id`
      );

      const queueId = queueResult.rows[0].queue_id;

      // Recover any READY order that has no courier
      // and is not already actively queued.
      await client.query(
        `INSERT INTO public.queue_entries
           (order_id, queue_id, readiness_status)
         SELECT o.order_id, $1, 'pending'
         FROM public.orders o
         WHERE o."orderStatus" = 'ready'
           AND NOT EXISTS (
             SELECT 1
             FROM public.courier_assignments ca
             WHERE ca.order_id = o.order_id
               AND ca.unassigned_at IS NULL
           )
           AND NOT EXISTS (
             SELECT 1
             FROM public.queue_entries qe
             WHERE qe.order_id = o.order_id
               AND qe.queue_id = $1
               AND qe.exited_at IS NULL
           )
         ON CONFLICT DO NOTHING`,
        [queueId]
      );

      // Process waiting orders in FIFO order.
      const entries = await client.query<QueueEntry>(
        `SELECT
           qe.queue_entry_id,
           qe.order_id,
           o."restaurantID",
           r."restaurantPosition",
           o."orderStatus"
         FROM public.queue_entries qe
         JOIN public.orders o
           ON o.order_id = qe.order_id
         JOIN public."Restaurant" r
           ON r."restaurantID" = o."restaurantID"
         WHERE qe.queue_id = $1
           AND qe.exited_at IS NULL
         ORDER BY qe.entered_at, qe.queue_entry_id`,
        [queueId]
      );

      let offered = 0;

      for (const entry of entries.rows) {
        
        // lock the order before the courier.
        const order = await client.query<{
          orderStatus: string;
        }>(
          `SELECT "orderStatus"
           FROM public.orders
           WHERE order_id = $1
           FOR UPDATE`,
          [entry.order_id]
        );

        const activeAssignment = await client.query(
          `SELECT 1
           FROM public.courier_assignments
           WHERE order_id = $1
             AND unassigned_at IS NULL`,
          [entry.order_id]
        );

        if (
          order.rows[0]?.orderStatus !== 'ready' ||
          activeAssignment.rowCount !== 0
        ) {
          await client.query(
            `UPDATE public.queue_entries
             SET exited_at = now()
             WHERE queue_entry_id = $1
               AND exited_at IS NULL`,
            [entry.queue_entry_id]
          );
          continue;
        }

        const existingOffer = await client.query<PendingOffer>(
          `SELECT
             d."assignedCourier"::text AS "courierId",
             c."courierStatus",
             EXISTS (
               SELECT 1
               FROM public.courier_assignments active
               WHERE active.courier_id = d."assignedCourier"
                 AND active.unassigned_at IS NULL
             ) AS "hasActiveAssignment"
           FROM public.ready_order_details d
           JOIN public."Courier" c
             ON c."accountID" = d."assignedCourier"
           WHERE d.order_id = $1
             AND d."assignedCourier" IS NOT NULL
             AND d.pickup_time IS NULL
             AND d.delivery_time IS NULL
           FOR UPDATE OF d`,
          [entry.order_id]
        );

        const offer = existingOffer.rows[0];
        if (offer) {
          if (
            offer.courierStatus === 'idle' &&
            !offer.hasActiveAssignment
          ) {
            continue;
          }

          await client.query(
            `UPDATE public.ready_order_details
             SET "assignedCourier" = NULL
             WHERE order_id = $1
               AND "assignedCourier" = $2
               AND pickup_time IS NULL
               AND delivery_time IS NULL`,
            [entry.order_id, offer.courierId]
          );
        }

        const idle = await client.query<{
          accountID: string;
          courierPosition: string;
        }>(
          `SELECT c."accountID", c."courierPosition"
           FROM public."Courier" c
           WHERE c."courierStatus" = 'idle'
             AND NOT EXISTS (
               SELECT 1
               FROM public.courier_assignments ca
               WHERE ca.courier_id = c."accountID"
                 AND ca.unassigned_at IS NULL
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.ready_order_details offer
                 JOIN public.orders offered_order
                   ON offered_order.order_id = offer.order_id
                 JOIN public.queue_entries offered_queue
                   ON offered_queue.order_id = offered_order.order_id
                 JOIN public.queues offered_queue_type
                   ON offered_queue_type.queue_id = offered_queue.queue_id
                 WHERE offer."assignedCourier" = c."accountID"
                   AND offer.pickup_time IS NULL
                   AND offer.delivery_time IS NULL
                   AND offered_order."orderStatus" = 'ready'
                   AND offered_queue_type.name = 'dispatch'
                   AND offered_queue.exited_at IS NULL
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.courier_assignments offered_assignment
                     WHERE offered_assignment.order_id = offered_order.order_id
                       AND offered_assignment.unassigned_at IS NULL
                   )
               )`
        );

        const couriers: AvailableCourier[] =
          idle.rows.map(row => ({
            id: String(row.accountID),
            ...parseCoordinates(row.courierPosition)
          }));

        const nearest = selectNearestCourier(
          parseCoordinates(entry.restaurantPosition),
          couriers
        );

        // No available courier: leave order waiting.
        // Later orders must not jump ahead of it.
        if (!nearest) {
          break;
        }

        // Lock selected courier and recheck availability.
        const courierLock = await client.query<{
          courierStatus: string;
        }>(
          `SELECT "courierStatus"
           FROM public."Courier"
           WHERE "accountID" = $1
           FOR UPDATE`,
          [nearest.id]
        );

        const courierBusy = await client.query(
          `SELECT 1
           FROM public.courier_assignments
           WHERE courier_id = $1
             AND unassigned_at IS NULL`,
          [nearest.id]
        );

        const courierHasOffer = await client.query(
          `SELECT 1
           FROM public.ready_order_details offer
           JOIN public.orders offered_order
             ON offered_order.order_id = offer.order_id
           JOIN public.queue_entries offered_queue
             ON offered_queue.order_id = offered_order.order_id
           JOIN public.queues offered_queue_type
             ON offered_queue_type.queue_id = offered_queue.queue_id
           WHERE offer."assignedCourier" = $1
             AND offer.pickup_time IS NULL
             AND offer.delivery_time IS NULL
             AND offered_order."orderStatus" = 'ready'
             AND offered_queue_type.name = 'dispatch'
             AND offered_queue.exited_at IS NULL
             AND NOT EXISTS (
               SELECT 1
               FROM public.courier_assignments offered_assignment
               WHERE offered_assignment.order_id = offered_order.order_id
                 AND offered_assignment.unassigned_at IS NULL
             )
           LIMIT 1`,
          [nearest.id]
        );

        if (
          courierLock.rows[0]?.courierStatus !== 'idle' ||
          courierBusy.rowCount !== 0 ||
          courierHasOffer.rowCount !== 0
        ) {
          // A concurrent courier action changed eligibility.
          // Keep the order queued for a future retry.
          break;
        }

        const details = await client.query(
          `INSERT INTO public.ready_order_details
             (order_id, "assignedCourier")
           VALUES ($1, $2)
           ON CONFLICT (order_id)
           DO UPDATE SET
             "assignedCourier" =
               EXCLUDED."assignedCourier"
           WHERE
             public.ready_order_details."assignedCourier" IS NULL
             AND
             public.ready_order_details.pickup_time IS NULL
             AND
             public.ready_order_details.delivery_time IS NULL`,
          [entry.order_id, nearest.id]
        );

        if (details.rowCount !== 1) {
          throw new Error(
            'Failed to save ready-order assignment.'
          );
        }

        offered++;
        // The courier and queue entry remain available until the courier accepts.
      }

      const waitingResult = await client.query<{
        count: string;
      }>(
        `SELECT COUNT(*)::text AS count
         FROM public.queue_entries
         WHERE queue_id = $1
           AND exited_at IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.ready_order_details offer
             JOIN public.orders offered_order
               ON offered_order.order_id = offer.order_id
             WHERE offer.order_id = public.queue_entries.order_id
               AND offer."assignedCourier" IS NOT NULL
               AND offer.pickup_time IS NULL
               AND offer.delivery_time IS NULL
               AND offered_order."orderStatus" = 'ready'
           )`,
        [queueId]
      );

      await client.query('COMMIT');

      return {
        offered,
        waiting: Number(waitingResult.rows[0].count)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
