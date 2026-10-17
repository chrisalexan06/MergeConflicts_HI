import { Router } from 'express';
import { RestaurantService } from '../application/ORD/RestaurantService.js';

const router = Router();
const restaurantService = new RestaurantService();
let restaurantsLoaded: Promise<unknown> | null = null;

// Temporary endpoint for manually testing R-ORD-01.
router.get('/', async (_req, res) => {
  restaurantsLoaded ??= restaurantService.loadRestaurants();
  await restaurantsLoaded;
  res.json(restaurantService.getRestaurants());
});

export default router;
