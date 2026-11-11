import { Router, type Request, type Response } from 'express';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Role } from '../domain/REG/Role.js';
import { RestaurantService } from '../application/ORD/RestaurantService.js';
import { MenuItemStatus } from '../domain/ORD/MenuItemStatus.js';

const router = Router();
const restaurantService = new RestaurantService();
const authentication = new AuthenticationService(new RegistrationService());
let restaurantsLoaded: Promise<unknown> | null = null;

function getRestaurantStaff(req: Request, res: Response): string | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authentication.getCurrentUser(token) : null;
  if (!account) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (account.role !== Role.RESTAURANT) {
    res.status(403).json({ error: 'Restaurant staff role required.' });
    return null;
  }
  return String(account.accountID);
}

// Temporary endpoint for manually testing R-ORD-01.
router.get('/', async (_req, res) => {
  try {
    restaurantsLoaded ??= restaurantService.loadRestaurants();
    await restaurantsLoaded;
    res.json(restaurantService.getRestaurants());
  } catch (error) {
    restaurantsLoaded = null;
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load restaurants.',
    });
  }
});

router.get('/me', async (req, res) => {
  const accountId = getRestaurantStaff(req, res);
  if (!accountId) return;

  try {
    const restaurant = await restaurantService.getRestaurantForStaff(accountId);
    if (!restaurant) {
      res.status(404).json({ error: 'No restaurant is associated with this account.' });
      return;
    }
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load the restaurant.',
    });
  }
});

router.post('/me/pause', async (req, res) => {
  const accountId = getRestaurantStaff(req, res);
  if (!accountId) return;

  try {
    const restaurant = await restaurantService.pauseRestaurantForStaff(accountId);
    if (!restaurant) {
      res.status(404).json({ error: 'No restaurant is associated with this account.' });
      return;
    }

    restaurantsLoaded = null;
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not pause the restaurant.',
    });
  }
});

router.patch('/me/menu-items/:itemId/status', async (req, res) => {
  const accountId = getRestaurantStaff(req, res);
  if (!accountId) return;

  const itemId = Number(req.params.itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    res.status(400).json({ error: 'A valid menu item ID is required.' });
    return;
  }

  const status = req.body?.status;
  if (status !== MenuItemStatus.AVAILABLE && status !== MenuItemStatus.SOLD_OUT) {
    res.status(400).json({ error: 'Status must be available or sold_out.' });
    return;
  }

  try {
    const item = await restaurantService.updateMenuItemStatusForStaff(
      accountId,
      itemId,
      status
    );
    if (!item) {
      res.status(404).json({ error: 'Menu item was not found for this restaurant.' });
      return;
    }

    restaurantsLoaded = null;
    res.json(item);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not update menu item availability.',
    });
  }
});

router.patch('/me/menu-items/:itemId', async (req, res) => {
  const accountId = getRestaurantStaff(req, res);
  if (!accountId) return;

  const itemId = Number(req.params.itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    res.status(400).json({ error: 'A valid menu item ID is required.' });
    return;
  }

  const itemName = req.body?.name;
  const price = req.body?.price;
  if (typeof itemName !== 'string' || !itemName.trim()) {
    res.status(400).json({ error: 'Menu item name must not be empty.' });
    return;
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: 'Menu item price must be a finite number greater than zero.' });
    return;
  }

  try {
    const item = await restaurantService.updateMenuItemDetailsForStaff(
      accountId,
      itemId,
      itemName.trim(),
      price
    );
    if (!item) {
      res.status(404).json({ error: 'Menu item was not found for this restaurant.' });
      return;
    }

    restaurantsLoaded = null;
    res.json(item);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not update menu item details.',
    });
  }
});

export default router;
