import type { Pool, PoolClient } from 'pg';
import { Courier } from '../../domain/DLV/Courier.js';
import { CourierStatus } from '../../domain/DLV/CourierStatus.js';
import type { ICourierStore } from './ICourierStore.js';
import type {
  CourierLocation,
  Coordinates
} from './ICourierStore.js';

import {
  parseCoordinates
} from '../../application/DLV/Coordinates.js';

interface CourierRow {
  accountID: string;
  accountName: string;
  courierStatus: CourierStatus;
  currentOrderId: string | null;
  currentOrderStatus: string | null;
}

export interface CourierWithOrderStatus extends Courier {
  currentOrderStatus: string | null;
}

function mapCourier(row: CourierRow): CourierWithOrderStatus {
  const courier = new Courier(
    String(row.accountID),
    row.accountName,
    row.courierStatus,
    row.currentOrderId === null
      ? null
      : String(row.currentOrderId)
  );
  return Object.assign(courier, {
    currentOrderStatus: row.currentOrderStatus,
  });
}

export class PostgresCourierStore implements ICourierStore {
  constructor(private readonly db: Pool) {}

  private readonly courierQuery = `
    SELECT
      c."accountID",
      a."accountName",
      c."courierStatus",
      active.order_id AS "currentOrderId",
      active."currentOrderStatus"
    FROM public."Courier" c
    JOIN public."Account" a
      ON a."accountID" = c."accountID"
    LEFT JOIN LATERAL (
      SELECT ca.order_id, o."orderStatus" AS "currentOrderStatus"
      FROM public.courier_assignments ca
      JOIN public.orders o
        ON o.order_id = ca.order_id
      WHERE ca.courier_id = c."accountID"
        AND ca.unassigned_at IS NULL
      LIMIT 1
    ) active ON TRUE
  `;

  async findById(id: string): Promise<CourierWithOrderStatus | null> {
    const result = await this.db.query<CourierRow>(
      `${this.courierQuery}
       WHERE c."accountID" = $1`,
      [id]
    );

    return result.rows[0]
      ? mapCourier(result.rows[0])
      : null;
  }

  async findIdleCouriers(): Promise<Courier[]> {
    const result = await this.db.query<CourierRow>(
      `${this.courierQuery}
       WHERE c."courierStatus" = 'idle'
         AND active.order_id IS NULL
       ORDER BY c."accountID"`
    );

    return result.rows.map(mapCourier);
  }

  
async findAvailableCouriers(): Promise<CourierLocation[]> {
  const result = await this.db.query<{
    accountID: string;
    courierPosition: string;
  }>(
    `SELECT
       c."accountID",
       c."courierPosition"
     FROM public."Courier" c
     WHERE c."courierStatus" = 'idle'
       AND NOT EXISTS (
         SELECT 1
         FROM public.courier_assignments ca
         WHERE ca.courier_id = c."accountID"
           AND ca.unassigned_at IS NULL
       )`
  );

  return result.rows.map(row => ({
    id: String(row.accountID),
    ...parseCoordinates(row.courierPosition)
  }));
}

async findRestaurantPosition(
  restaurantId: string
): Promise<Coordinates> {
  const result = await this.db.query<{
    restaurantPosition: string;
  }>(
    `SELECT "restaurantPosition"
     FROM public."Restaurant"
     WHERE "restaurantID" = $1`,
    [restaurantId]
  );

  if (!result.rows[0]) {
    throw new Error('Restaurant not found.');
  }

  return parseCoordinates(
    result.rows[0].restaurantPosition
  );
}

  // Compatibility with the existing ICourierStore.
  async save(courier: Courier): Promise<void> {
    const result = await this.db.query(
      `UPDATE public."Courier"
       SET "courierStatus" = $2
       WHERE "accountID" = $1
         AND "courierStatus" = $3
         AND (
           ( $2 IN ('idle', 'offline')
             AND NOT EXISTS (
               SELECT 1
               FROM public.courier_assignments
               WHERE courier_id = $1
                 AND unassigned_at IS NULL
             )
           )
           OR
           ( $2 IN ('assigned', 'carrying')
             AND EXISTS (
               SELECT 1
               FROM public.courier_assignments
               WHERE courier_id = $1
                 AND order_id = $4
                 AND unassigned_at IS NULL
             )
           )
         )`,
      [
        courier.id,
        courier.status,
        courier.status,
        courier.currentOrderId
      ]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        'Courier state could not be saved.'
      );
    }
  }

  private async transaction<T>(
    action: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const result = await action(client);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockCourier(
    client: PoolClient,
    courierId: string
  ): Promise<Courier> {
    // Serialize state-changing operations for this courier.
    const locked = await client.query(
      `SELECT "accountID"
       FROM public."Courier"
       WHERE "accountID" = $1
       FOR UPDATE`,
      [courierId]
    );

    if (locked.rowCount !== 1) {
      throw new Error('Courier not found.');
    }

    const result = await client.query<CourierRow>(
      `${this.courierQuery}
       WHERE c."accountID" = $1`,
      [courierId]
    );

    if (!result.rows[0]) {
      throw new Error('Courier not found.');
    }

    return mapCourier(result.rows[0]);
  }
  private async readCourier(
  client: PoolClient,
  courierId: string
): Promise<Courier> {
  const result = await client.query<CourierRow>(
    `${this.courierQuery}
     WHERE c."accountID" = $1`,
    [courierId]
  );

  if (!result.rows[0]) {
    throw new Error('Courier not found.');
  }

  return mapCourier(result.rows[0]);
}
  async changeDuty(
    courierId: string,
    onDuty: boolean
  ): Promise<Courier> {
    return this.transaction(async (client) => {
      const courier = await this.lockCourier(
        client, courierId
      );

      if (onDuty) {
        courier.goOnDuty();
      } else {
        courier.goOffDuty();
      }

      await client.query(
        `UPDATE public."Courier"
         SET "courierStatus" = $2
         WHERE "accountID" = $1`,
        [courierId, courier.status]
      );

      return await this.readCourier(client, courierId);
    });
  }

  async pickup(
    courierId: string,
    orderId: string
  ): Promise<Courier> {
    return this.transaction(async (client) => {
      

      const order = await client.query<{
        orderStatus: string;
      }>(
        `SELECT "orderStatus"
         FROM public.orders
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (order.rows[0]?.orderStatus !== 'ready') {
        throw new Error(
          'Order must be ready before pickup.'
        );
      }

      const courier = await this.lockCourier(
        client, courierId
      );

      const assignment = await client.query(
        `SELECT assignment_id
         FROM public.courier_assignments
         WHERE courier_id = $1
           AND order_id = $2
           AND unassigned_at IS NULL
         FOR UPDATE`,
        [courierId, orderId]
      );

      if (assignment.rowCount !== 1) {
        throw new Error(
          'No active courier assignment for this order.'
        );
      }

      const details = await client.query<{
        assignedCourier: string | null;
      }>(
        `SELECT "assignedCourier"
         FROM public.ready_order_details
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (
        details.rows[0]?.assignedCourier != null &&
        String(details.rows[0].assignedCourier) !== courierId
      ) {
        throw new Error(
          'Order is assigned to a different courier.'
        );
      }

      courier.confirmPickup(orderId);

      const updated = await client.query(
        `UPDATE public.orders
         SET "orderStatus" = 'picked_up',
             updated_at = now()
         WHERE order_id = $1
           AND "orderStatus" = 'ready'`,
        [orderId]
      );

      if (updated.rowCount !== 1) {
        throw new Error('Pickup state update failed.');
      }

      await client.query(
        `INSERT INTO public.ready_order_details
           (order_id, "assignedCourier", pickup_time)
         VALUES ($1, $2, now())
         ON CONFLICT (order_id)
         DO UPDATE SET
           "assignedCourier" = EXCLUDED."assignedCourier",
           pickup_time = EXCLUDED.pickup_time`,
        [orderId, courierId]
      );

      await client.query(
        `UPDATE public."Courier"
         SET "courierStatus" = 'carrying'
         WHERE "accountID" = $1`,
        [courierId]
      );

      await client.query(
        `INSERT INTO public.order_events
           (order_id, event_type, from_status, to_status)
         VALUES ($1, 'status_transition',
                 'ready', 'picked_up')`,
        [orderId]
      );

      return await this.readCourier(client, courierId);
    });
  }

  async deliver(
    courierId: string,
    orderId: string
  ): Promise<Courier> {
    return this.transaction(async (client) => {
      

      const order = await client.query<{
        orderStatus: string;
      }>(
        `SELECT "orderStatus"
         FROM public.orders
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (order.rows[0]?.orderStatus !== 'picked_up') {
        throw new Error(
          'Order must be picked up before delivery.'
        );
      }

      const courier = await this.lockCourier(
        client, courierId
      );

      const assignment = await client.query(
        `SELECT assignment_id
         FROM public.courier_assignments
         WHERE courier_id = $1
           AND order_id = $2
           AND unassigned_at IS NULL
         FOR UPDATE`,
        [courierId, orderId]
      );

      if (assignment.rowCount !== 1) {
        throw new Error(
          'No active assignment for this delivery.'
        );
      }

      courier.confirmDelivery(orderId);

      const updated = await client.query(
        `UPDATE public.orders
         SET "orderStatus" = 'delivered',
             updated_at = now()
         WHERE order_id = $1
           AND "orderStatus" = 'picked_up'`,
        [orderId]
      );

      if (updated.rowCount !== 1) {
        throw new Error('Delivery state update failed.');
      }
        const deliveryDetails = await client.query(
        `UPDATE public.ready_order_details
        SET delivery_time = now()
        WHERE order_id = $1
            AND "assignedCourier" = $2
            AND pickup_time IS NOT NULL
            AND delivery_time IS NULL`,
        [orderId, courierId]
        );

        if (deliveryDetails.rowCount !== 1) {
        throw new Error('Delivery details could not be updated.');
}

      await client.query(
        `UPDATE public.courier_assignments
         SET unassigned_at = now()
         WHERE courier_id = $1
           AND order_id = $2
           AND unassigned_at IS NULL`,
        [courierId, orderId]
      );

      await client.query(
        `UPDATE public."Courier"
         SET "courierStatus" = 'idle'
         WHERE "accountID" = $1`,
        [courierId]
      );

      await client.query(
        `INSERT INTO public.order_events
           (order_id, event_type, from_status, to_status)
         VALUES ($1, 'status_transition',
                 'picked_up', 'delivered')`,
        [orderId]
      );

      return await this.readCourier(client, courierId);
    });
  }
  public async assignOrder(
  courierId: string,
  orderId: string
): Promise<Courier> {
  return this.transaction(async (client) => {
    
    const orderResult = await client.query<{
      orderStatus: string;
    }>(
      `SELECT "orderStatus"
       FROM public.orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows[0]?.orderStatus !== 'ready') {
      throw new Error('Only ready orders can be assigned.');
    }

    const courier = await this.lockCourier(client, courierId);


    courier.acceptOrder(orderId);

    // Record the accepted assignment.
    await client.query(
      `INSERT INTO public.courier_assignments
         (order_id, courier_id)
       VALUES ($1, $2)`,
      [orderId, courierId]
    );

    // Record the courier responsible for the delivery.
    await client.query(
      `INSERT INTO public.ready_order_details
         (order_id, "assignedCourier")
       VALUES ($1, $2)
       ON CONFLICT (order_id)
       DO UPDATE SET
         "assignedCourier" = EXCLUDED."assignedCourier"`,
      [orderId, courierId]
    );

    // Update courier state.
    const updated = await client.query(
      `UPDATE public."Courier"
       SET "courierStatus" = 'assigned'
       WHERE "accountID" = $1
         AND "courierStatus" = 'idle'`,
      [courierId]
    );

    if (updated.rowCount !== 1) {
      throw new Error('Courier is no longer available.');
    }

    return await this.readCourier(client, courierId);
  });
}





async reassignOrder(
  orderId: string,
  newCourierId: string,
  confirmedHandoff = false
): Promise<void> {
  await this.transaction(async (client) => {
    // Lock the order before changing its assignment.
    const order = await client.query<{ orderStatus: string }>(
      `SELECT "orderStatus"
       FROM public.orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    const status = order.rows[0]?.orderStatus;

    if (status !== 'ready' && status !== 'picked_up') {
      throw new Error('Order is not eligible for reassignment.');
    }

    const afterPickup = status === 'picked_up';

    if (afterPickup && !confirmedHandoff) {
      throw new Error(
        'Operator must confirm the physical handoff.'
      );
    }

    // Find the active assignment.
    const existing = await client.query<{ courier_id: string }>(
      `SELECT courier_id
       FROM public.courier_assignments
       WHERE order_id = $1
         AND unassigned_at IS NULL`,
      [orderId]
    );

    if (existing.rows.length !== 1) {
      throw new Error('Order must have one active assignment.');
    }

    const oldCourierId = String(existing.rows[0].courier_id);

    if (oldCourierId === newCourierId) {
      throw new Error('Courier is already assigned.');
    }

    // Lock both couriers in numeric ID order.
    const couriers = await client.query<{
      accountID: string;
      courierStatus: string;
    }>(
      `SELECT "accountID", "courierStatus"
       FROM public."Courier"
       WHERE "accountID" IN ($1, $2)
       ORDER BY "accountID"
       FOR UPDATE`,
      [oldCourierId, newCourierId]
    );

    const oldCourier = couriers.rows.find(
      c => String(c.accountID) === oldCourierId
    );

    const newCourier = couriers.rows.find(
      c => String(c.accountID) === newCourierId
    );

    const expectedOldStatus = afterPickup
      ? 'carrying'
      : 'assigned';

    if (oldCourier?.courierStatus !== expectedOldStatus) {
      throw new Error('Current courier state is invalid.');
    }

    if (newCourier?.courierStatus !== 'idle') {
      throw new Error('Replacement courier must be idle.');
    }

    const busy = await client.query(
      `SELECT 1
       FROM public.courier_assignments
       WHERE courier_id = $1
         AND unassigned_at IS NULL`,
      [newCourierId]
    );

    if (busy.rowCount !== 0) {
      throw new Error('Replacement courier already has an order.');
    }

    // Validate the existing delivery record.
    const details = await client.query<{
      assignedCourier: string | null;
      pickup_time: Date | null;
      delivery_time: Date | null;
    }>(
      `SELECT "assignedCourier", pickup_time, delivery_time
       FROM public.ready_order_details
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    const currentDetails = details.rows[0];

    if (
      !currentDetails ||
      String(currentDetails.assignedCourier) !== oldCourierId ||
      currentDetails.delivery_time !== null ||
      (afterPickup && currentDetails.pickup_time === null) ||
      (!afterPickup && currentDetails.pickup_time !== null)
    ) {
      throw new Error('Delivery details are inconsistent.');
    }

    // Close the old assignment, preserving history.
    const closed = await client.query(
      `UPDATE public.courier_assignments
       SET unassigned_at = now()
       WHERE order_id = $1
         AND courier_id = $2
         AND unassigned_at IS NULL`,
      [orderId, oldCourierId]
    );

    if (closed.rowCount !== 1) {
      throw new Error('Could not close old assignment.');
    }

    // Create the replacement assignment.
    await client.query(
      `INSERT INTO public.courier_assignments
         (order_id, courier_id)
       VALUES ($1, $2)`,
      [orderId, newCourierId]
    );

    // Preserve the original pickup timestamp.
    const detailUpdate = await client.query(
      `UPDATE public.ready_order_details
       SET "assignedCourier" = $2
       WHERE order_id = $1
         AND "assignedCourier" = $3`,
      [orderId, newCourierId, oldCourierId]
    );

    if (detailUpdate.rowCount !== 1) {
      throw new Error('Could not update assigned courier.');
    }

    // Release the previous courier.
    const oldUpdated = await client.query(
      `UPDATE public."Courier"
       SET "courierStatus" = 'idle'
       WHERE "accountID" = $1
         AND "courierStatus" = $2`,
      [oldCourierId, expectedOldStatus]
    );

    // After a confirmed handoff, new courier is carrying.
    const newStatus = afterPickup ? 'carrying' : 'assigned';

    const newUpdated = await client.query(
      `UPDATE public."Courier"
       SET "courierStatus" = $2
       WHERE "accountID" = $1
         AND "courierStatus" = 'idle'`,
      [newCourierId, newStatus]
    );

    if (oldUpdated.rowCount !== 1 || newUpdated.rowCount !== 1) {
      throw new Error('Could not update courier statuses.');
    }

    // Record the operation.
    await client.query(
      `INSERT INTO public.order_events
         (order_id, event_type)
       VALUES ($1, $2)`,
      [
        orderId,
        afterPickup
          ? 'courier_handoff'
          : 'courier_reassigned'
      ]
    );
  });
}

}
