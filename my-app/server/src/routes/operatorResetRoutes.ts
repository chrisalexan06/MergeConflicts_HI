import { Router } from 'express';
import { ResetInitialStateService } from '../application/OPR/ResetInitialStateService.js';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { pool } from '../db.js';
import { resetOrderSummaryCache } from './orderSummaryRoutes.js';

const router = Router();
const authentication = new AuthenticationService(new RegistrationService());
const resetService = new ResetInitialStateService(pool);

router.post('/reset', async (request, response) => {
  const token = request.headers.authorization
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const account = token ? authentication.getCurrentUser(token) : null;

  if (!account) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (account.role !== Role.OPERATOR) {
    response.status(403).json({ error: 'Only operators can restore the initial state.' });
    return;
  }

  try {
    await resetService.reset();
    resetOrderSummaryCache();
    response.json({ message: 'Initial state restored successfully.' });
  } catch (error) {
    console.error('Initial-state reset failed:', error);
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Could not restore the initial state.',
    });
  }
});

export default router;
