import { Router, type Request, type Response } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { RatingService } from '../application/RAT/RatingService.js';
import { Role } from '../domain/REG/Role.js';

const router = Router();
const authentication = new AuthenticationService(new RegistrationService());
const ratingService = new RatingService();

function sendRatingError(response: Response, error: unknown, fallbackMessage: string): void {
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
  if (errorCode === '42P01') {
    console.warn('Rating table public."OrderRatings" is missing from the configured database.');
    response.status(503).json({
      error: 'Rating table public."OrderRatings" was not found. Create it in the public schema of the database configured by DATABASE_URL.',
    });
    return;
  }

  console.error(fallbackMessage, error);
  const databaseMessage = typeof error === 'object' && error !== null && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : null;
  response.status(500).json({
    error: databaseMessage ? `${fallbackMessage} ${databaseMessage}` : fallbackMessage,
  });
}

function getCustomerId(request: Request, response: Response): string | null {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authentication.getCurrentUser(token) : null;
  if (!account) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (account.role !== Role.CUSTOMER) {
    response.status(403).json({ error: 'Customer role required.' });
    return null;
  }
  return String(account.accountID);
}

function getCourierId(request: Request, response: Response): string | null {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authentication.getCurrentUser(token) : null;
  if (!account) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (account.role !== Role.COURIER) {
    response.status(403).json({ error: 'Courier role required.' });
    return null;
  }
  return String(account.accountID);
}

router.get('/restaurants', async (_request, response) => {
  try {
    response.json(await ratingService.listRestaurantSummaries());
  } catch (error) {
    sendRatingError(response, error, 'Could not load restaurant ratings.');
  }
});

router.get('/mine', async (request, response) => {
  const customerId = getCustomerId(request, response);
  if (!customerId) return;
  try {
    response.json(await ratingService.listCustomerRatings(customerId));
  } catch (error) {
    sendRatingError(response, error, 'Could not load your ratings.');
  }
});

router.get('/courier/me', async (request, response) => {
  const courierId = getCourierId(request, response);
  if (!courierId) return;
  try {
    response.json(await ratingService.getCourierSummary(courierId));
  } catch (error) {
    sendRatingError(response, error, 'Could not load your rating summary.');
  }
});

router.post('/orders/:orderId', async (request, response) => {
  const customerId = getCustomerId(request, response);
  if (!customerId) return;

  const orderId = Number(request.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    response.status(400).json({ error: 'A valid order ID is required.' });
    return;
  }
  const restaurantRating = request.body?.restaurantRating;
  const courierRating = request.body?.courierRating;
  if (
    typeof restaurantRating !== 'number'
    || !Number.isInteger(restaurantRating)
    || restaurantRating < 1
    || restaurantRating > 5
    || typeof courierRating !== 'number'
    || !Number.isInteger(courierRating)
    || courierRating < 1
    || courierRating > 5
  ) {
    response.status(400).json({ error: 'Restaurant and courier ratings must each be whole numbers from 1 to 5.' });
    return;
  }

  try {
    const result = await ratingService.submitRating(
      customerId,
      orderId,
      restaurantRating,
      courierRating,
    );
    if (result.kind === 'not_found') {
      response.status(404).json({ error: 'Delivered order was not found for this customer.' });
      return;
    }
    if (result.kind === 'not_delivered') {
      response.status(409).json({ error: 'You can rate after the order is delivered.' });
      return;
    }
    if (result.kind === 'courier_unavailable') {
      response.status(409).json({ error: 'This order does not have a courier to rate.' });
      return;
    }
    if (result.kind === 'already_rated') {
      response.status(409).json({ error: 'This order has already been rated.' });
      return;
    }
    response.status(201).json(result.rating);
  } catch (error) {
    sendRatingError(response, error, 'Could not submit the rating.');
  }
});

export default router;
