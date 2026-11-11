import { Router } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { pool } from '../db.js';
import { PostgresOrderStore } from '../infrastructure/order/PostgresOrderStore.js';

const router = Router();
const authentication = new AuthenticationService(new RegistrationService());
const orderStore = new PostgresOrderStore(pool);

interface OrderPartiesRow {
  orderId: string | number;
  customerName: string | null;
  restaurantName: string | null;
  courierId: string | number | null;
  courierName: string | null;
}

router.get('/', async (request, response) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authentication.getCurrentUser(token) : null;

  if (!account) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (account.role !== Role.OPERATOR) {
    response.status(403).json({ error: 'Only operators can view all orders.' });
    return;
  }

  try {
    const orders = await orderStore.findAll();
    const partiesResult = await pool.query<OrderPartiesRow>(
      `SELECT o.order_id AS "orderId",
              customer."accountName" AS "customerName",
              r."restaurantName" AS "restaurantName",
              COALESCE(ca.courier_id, rod."assignedCourier") AS "courierId",
              courier."accountName" AS "courierName"
       FROM public.orders o
       LEFT JOIN public."Account" customer
         ON customer."accountID" = o."customerID"
       LEFT JOIN public."Restaurant" r
         ON r."restaurantID" = o."restaurantID"
       LEFT JOIN public.courier_assignments ca
         ON ca.order_id = o.order_id
        AND ca.unassigned_at IS NULL
       LEFT JOIN public.ready_order_details rod
         ON rod.order_id = o.order_id
       LEFT JOIN public."Account" courier
         ON courier."accountID" = COALESCE(ca.courier_id, rod."assignedCourier")
       ORDER BY o.order_id`
    );
    const partiesByOrderId = new Map(
      partiesResult.rows.map(row => [String(row.orderId), row])
    );

    response.json(orders.map(order => {
      const parties = partiesByOrderId.get(order.id);
      return {
        orderId: Number(order.id),
        status: order.status,
        customerId: Number(order.customerId),
        customerName: parties?.customerName ?? null,
        restaurantId: Number(order.restaurantId),
        restaurantName: parties?.restaurantName ?? null,
        courierId: parties?.courierId == null ? null : Number(parties.courierId),
        courierName: parties?.courierName ?? null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        items: order.lines.map(line => ({
          itemId: Number(line.itemId),
          itemName: line.itemName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      };
    }));
  } catch (error) {
    console.error('Operator order listing failed:', error);
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load all orders.',
    });
  }
});

export default router;
