import { pool } from '../../db.js';
import { Menu } from '../../domain/ORD/Menu.js';
import { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import { MenuService, type DatabaseQuery } from './MenuService.js';

interface RestaurantRow extends Record<string, unknown> {
  restaurantID: string | number;
  restaurantName: string;
  restaurantPosition: string;
  restaurantStatus: string;
}

function parseId(value: unknown, field: string): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Invalid ${field} value returned by the database: ${String(value)}.`);
  }
  return id;
}

function parsePosition(position: string, restaurantId: number): [number, number] {
  const coordinates = position.split(',');
  if (coordinates.length !== 2) {
    throw new Error(`Invalid restaurantPosition for restaurant ${restaurantId}: expected "latitude,longitude".`);
  }

  const latitude = Number(coordinates[0].trim());
  const longitude = Number(coordinates[1].trim());
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new Error(`Invalid restaurantPosition coordinates for restaurant ${restaurantId}.`);
  }

  return [latitude, longitude];
}

function parseRestaurantStatus(status: string, restaurantId: number): RestaurantStatus {
  switch (status.trim().toLowerCase()) {
    case RestaurantStatus.OPEN:
      return RestaurantStatus.OPEN;
    case RestaurantStatus.PAUSED:
      return RestaurantStatus.PAUSED;
    case RestaurantStatus.CLOSED:
      return RestaurantStatus.CLOSED;
    default:
      throw new Error(`Invalid restaurantStatus for restaurant ${restaurantId}: ${status}.`);
  }
}

export class RestaurantService {
  private restaurants: Restaurant[] | null = null;
  private readonly menuService: MenuService;

  constructor(private readonly query: DatabaseQuery = pool.query.bind(pool)) {
    this.menuService = new MenuService(query);
  }

  public async loadRestaurants(): Promise<Restaurant[]> {
    const result = await this.query(
      `SELECT "restaurantID", "restaurantName", "restaurantPosition", "restaurantStatus"
       FROM public."Restaurant"
       ORDER BY "restaurantID";`
    );

    const restaurants = await Promise.all((result.rows as RestaurantRow[]).map(async (row) => {
      const restaurantId = parseId(row.restaurantID, 'restaurantID');
      if (typeof row.restaurantName !== 'string' || typeof row.restaurantPosition !== 'string'
        || typeof row.restaurantStatus !== 'string') {
        throw new Error(`Invalid restaurant data returned for restaurant ${restaurantId}.`);
      }

      const [latitude, longitude] = parsePosition(row.restaurantPosition, restaurantId);
      const menu = await this.menuService.getMenuForRestaurant(restaurantId);
      return new Restaurant(
        restaurantId,
        row.restaurantName,
        parseRestaurantStatus(row.restaurantStatus, restaurantId),
        latitude,
        longitude,
        menu
      );
    }));

    this.restaurants = restaurants;
    return this.getRestaurants();
  }

  public getRestaurants(): Restaurant[] {
    if (this.restaurants === null) {
      throw new Error('Restaurants have not been loaded. Call loadRestaurants() first.');
    }

    return [...this.restaurants];
  }

  public getRestaurantById(id: number): Restaurant | undefined {
    if (this.restaurants === null) {
      throw new Error('Restaurants have not been loaded. Call loadRestaurants() first.');
    }

    return this.restaurants.find((restaurant) => restaurant.restaurantId === id);
  }
}
