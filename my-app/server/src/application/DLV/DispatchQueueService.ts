
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

export class DispatchQueueService {
  constructor(private readonly db: Pool) {}

  async retryPendingOrders(): Promise<{
    assigned: number;
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

      let assigned = 0;

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

        // Close stale entries without reassigning.
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

        if (
          courierLock.rows[0]?.courierStatus !== 'idle' ||
          courierBusy.rowCount !== 0
        ) {
          // A concurrent courier action changed eligibility.
          // Keep the order queued for a future retry.
          break;
        }

        // Record the assignment and courier state
        // together, in this same transaction.
        await client.query(
          `INSERT INTO public.courier_assignments
             (order_id, courier_id)
           VALUES ($1, $2)`,
          [entry.order_id, nearest.id]
        );

        const details = await client.query(
          `INSERT INTO public.ready_order_details
             (order_id, "assignedCourier")
           VALUES ($1, $2)
           ON CONFLICT (order_id)
           DO UPDATE SET
             "assignedCourier" =
               EXCLUDED."assignedCourier"
           WHERE
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

        const courierUpdate = await client.query(
          `UPDATE public."Courier"
           SET "courierStatus" = 'assigned'
           WHERE "accountID" = $1
             AND "courierStatus" = 'idle'`,
          [nearest.id]
        );

        if (courierUpdate.rowCount !== 1) {
          throw new Error(
            'Failed to assign available courier.'
          );
        }

        const queueUpdate = await client.query(
          `UPDATE public.queue_entries
           SET exited_at = now(),
               readiness_status = 'ready'
           WHERE queue_entry_id = $1
             AND exited_at IS NULL`,
          [entry.queue_entry_id]
        );

        if (queueUpdate.rowCount !== 1) {
          throw new Error(
            'Failed to close dispatch queue entry.'
          );
        }

        await client.query(
          `INSERT INTO public.order_events
             (order_id, event_type)
           VALUES ($1, 'courier_assigned')`,
          [entry.order_id]
        );

        assigned++;
      }

      const waitingResult = await client.query<{
        count: string;
      }>(
        `SELECT COUNT(*)::text AS count
         FROM public.queue_entries
         WHERE queue_id = $1
           AND exited_at IS NULL`,
        [queueId]
      );

      await client.query('COMMIT');

      return {
        assigned,
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
