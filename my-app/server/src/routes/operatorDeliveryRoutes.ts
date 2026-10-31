
import { Router } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { PostgresCourierStore } from '../infrastructure/DLV/PostgresCourierStore.js';
import { pool } from '../db.js';

const router = Router();

const auth = new AuthenticationService(
  new RegistrationService()
);

const courierStore = new PostgresCourierStore(pool);

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
    await courierStore.reassignOrder(
      orderId,
      newCourierId
    );

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
