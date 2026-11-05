import { Router, type Response } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { CourierService } from '../services/courierService.js';
import { PostgresCourierStore } from '../infrastructure/DLV/PostgresCourierStore.js';
import { pool } from '../db.js';
import { DispatchQueueService } from '../application/DLV/DispatchQueueService.js';

const router = Router();

const auth = new AuthenticationService(
  new RegistrationService()
);

const courierService = new CourierService(
  new PostgresCourierStore(pool)
);
const dispatchQueue = new DispatchQueueService(pool);

router.use((req, res, next) => {
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

  if (account.role !== Role.COURIER) {
    res.status(403).json({
      error: 'Courier role required.'
    });
    return;
  }

  res.locals.courierId = String(account.accountID);
  next();
});

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error
    ? error.message
    : 'Courier operation failed.';

  res.status(message === 'Courier not found.' ? 404 : 409)
    .json({ error: message });
}

router.get('/me', async (_req, res) => {
  try {
    const courier = await courierService.getCourier(
      res.locals.courierId
    );

    res.json({
      id: courier.id,
      status: courier.status,
      currentOrderId: courier.currentOrderId
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/on-duty', async (_req, res) => {
  try {
    const courier = await courierService.goOnDuty(
      res.locals.courierId
    );
    // Courier became idle: retry pending dispatches.
    try {
      await dispatchQueue.retryPendingOrders();
    } catch (error) {
      console.error('Dispatch retry failed on duty:', error);
    }

    res.json({ status: courier.status });

  } catch (error) {
    sendError(res, error);
  }
});

router.post('/off-duty', async (_req, res) => {
  try {
    const courier = await courierService.goOffDuty(
      res.locals.courierId
    );

    res.json({ status: courier.status });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/orders/:orderId/pickup', async (req, res) => {
  try {
    const courier = await courierService.confirmPickup(
      res.locals.courierId,
      String(req.params.orderId)
    );

    res.json({
      status: courier.status,
      currentOrderId: courier.currentOrderId
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/orders/:orderId/deliver', async (req, res) => {
  try {
    const courier = await courierService.confirmDelivery(
      res.locals.courierId,
      String(req.params.orderId)
    );

  // Courier finished delivery and is idle again.
  try {
    await dispatchQueue.retryPendingOrders();
  } catch (error) {
    console.error('Dispatch retry failed after delivery:', error);
  }

  res.json({
    status: courier.status,
    currentOrderId: courier.currentOrderId
  });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;