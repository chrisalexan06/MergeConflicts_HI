import { Router } from 'express';
import { RestaurantService } from '../application/ORD/RestaurantService.js';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { RestaurantStatus } from '../domain/ORD/RestaurantStatus.js';
import { Role } from '../domain/REG/Role.js';

const router = Router();
const authentication = new AuthenticationService(new RegistrationService());
const restaurantService = new RestaurantService();

router.patch('/:restaurantId/status', async (request, response) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authentication.getCurrentUser(token) : null;

  if (!account) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (account.role !== Role.OPERATOR) {
    response.status(403).json({ error: 'Only operators can update restaurant status.' });
    return;
  }

  const restaurantId = Number(request.params.restaurantId);
  if (!Number.isSafeInteger(restaurantId) || restaurantId <= 0) {
    response.status(400).json({ error: 'A valid restaurant ID is required.' });
    return;
  }

  const status = request.body?.status;
  if (status !== RestaurantStatus.OPEN && status !== RestaurantStatus.PAUSED) {
    response.status(400).json({ error: 'Status must be open or paused.' });
    return;
  }

  try {
    const restaurant = await restaurantService.setRestaurantStatus(restaurantId, status);
    if (!restaurant) {
      response.status(404).json({ error: 'Restaurant was not found.' });
      return;
    }
    response.json(restaurant);
  } catch (error) {
    console.error('Operator restaurant status update failed:', error);
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Could not update restaurant status.',
    });
  }
});

export default router;
