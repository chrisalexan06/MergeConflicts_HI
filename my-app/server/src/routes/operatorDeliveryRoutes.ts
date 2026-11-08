
import { Router } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { PostgresCourierStore } from '../infrastructure/DLV/PostgresCourierStore.js';
import { pool } from '../db.js';
import { DispatchQueueService } from '../application/DLV/DispatchQueueService.js';
import { RestaurantService } from '../application/ORD/RestaurantService.js';
import { parseCoordinates } from '../application/DLV/Coordinates.js';

const router = Router();

const auth = new AuthenticationService(
  new RegistrationService()
);

const courierStore = new PostgresCourierStore(pool);
const dispatchQueue = new DispatchQueueService(pool);
const restaurantService = new RestaurantService();

router.get('/map-data', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? auth.getCurrentUser(token) : null;
  if (!account) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (account.role !== Role.OPERATOR) {
    res.status(403).json({ error: 'Only operators can access this resource.' });
    return;
  }

  try {
    const restaurants = await restaurantService.loadRestaurants();
    const result = await pool.query<{
      accountID: string | number;
      accountName: string;
      courierStatus: string;
      courierPosition: string;
    }>(`SELECT c."accountID", a."accountName", c."courierStatus", c."courierPosition"
        FROM public."Courier" c
        JOIN public."Account" a ON a."accountID" = c."accountID"
        WHERE c."courierStatus" <> 'offline'
        ORDER BY c."accountID"`);
    const couriers = result.rows.map(row => ({
      id: String(row.accountID),
      name: row.accountName,
      status: row.courierStatus,
      ...parseCoordinates(row.courierPosition)
    }));
    res.json({ restaurants, couriers });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not load dashboard map data.' });
  }
});

router.post('/orders/:orderId/reassign', async (req, res) => {
  const token = req.headers.authorization
    ?.replace(/^Bearer\s+/i, '')
    .trim();

  const account = token
    ? auth.getCurrentUser(token)
    : null;

  if (!account) {
    res.status(401).json({
      error: 'Authentication required.'
    });
    return;
  }

  if (account.role !== Role.OPERATOR) {
    res.status(403).json({
      error: 'Only operators can reassign orders.'
    });
    return;
  }

  const newCourierId = String(
    req.body?.newCourierId ?? ''
  );

  const orderId = String(req.params.orderId);

  if (
    !/^[1-9]\d*$/.test(newCourierId) ||
    !/^[1-9]\d*$/.test(orderId)
  ) {
    res.status(400).json({
      error: 'Valid order and courier IDs are required.'
    });
    return;
  }

  try {
    if (
  req.body?.confirmedHandoff !== undefined &&
  typeof req.body.confirmedHandoff !== 'boolean'
) {
  res.status(400).json({
    error: 'confirmedHandoff must be a boolean.'
  });
  return;
}

await courierStore.reassignOrder(
  orderId,
  newCourierId,
  req.body?.confirmedHandoff === true
);

// The previous courier may now be idle.
// Retry waiting orders using the dispatch queue.
try {
  await dispatchQueue.retryPendingOrders();
} catch (error) {
  console.error(
    'Dispatch retry failed after operator reassignment:',
    error
  );
}


    res.json({
      message: 'Order reassigned successfully.',
      orderId,
      courierId: newCourierId
    });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error
        ? error.message
        : 'Reassignment failed.'
    });
  }
});

export default router;
