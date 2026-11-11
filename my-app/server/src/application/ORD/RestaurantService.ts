import { pool } from '../../db.js';
import { Menu } from '../../domain/ORD/Menu.js';
import { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import type { MenuItem } from '../../domain/ORD/MenuItem.js';
import { MenuService, type DatabaseQuery } from './MenuService.js';

interface RestaurantRow extends Record<string, unknown> {
  restaurantID: string | number;
  restaurantName: string;
  restaurantPosition: string;
  restaurantStatus: string;
}

export interface StaffRestaurantSummary {
  restaurantId: number;
  restaurantName: string;
  status: RestaurantStatus;
  menuItems: MenuItem[];
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

  public async getRestaurantForStaff(accountId: string): Promise<StaffRestaurantSummary | null> {
    const result = await this.query(
      `SELECT r."restaurantID", r."restaurantName", r."restaurantStatus"
       FROM public."Restaurant" r
       JOIN public."RestaurantStaff" rs
         ON rs."restaurantID" = r."restaurantID"
       WHERE rs."accountID" = $1
       ORDER BY r."restaurantID"
       LIMIT 1;`,
      [accountId]
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const restaurantId = parseId(row.restaurantID, 'restaurantID');
    if (typeof row.restaurantName !== 'string' || typeof row.restaurantStatus !== 'string') {
      throw new Error(`Invalid restaurant data returned for restaurant ${restaurantId}.`);
    }

    const menu = await this.menuService.getMenuForRestaurant(restaurantId);
    return {
      restaurantId,
      restaurantName: row.restaurantName,
      status: parseRestaurantStatus(row.restaurantStatus, restaurantId),
      menuItems: menu.items,
    };
  }

  public async updateMenuItemStatusForStaff(
    accountId: string,
    itemId: number,
    status: MenuItemStatus
  ): Promise<MenuItem | null> {
    return this.menuService.updateItemStatusForStaff(accountId, itemId, status);
  }

  public async updateMenuItemDetailsForStaff(
    accountId: string,
    itemId: number,
    itemName: string,
    price: number
  ): Promise<MenuItem | null> {
    return this.menuService.updateItemDetailsForStaff(accountId, itemId, itemName, price);
  }

  public async pauseRestaurantForStaff(accountId: string): Promise<StaffRestaurantSummary | null> {
    return this.updateRestaurantStatusForStaff(accountId, RestaurantStatus.PAUSED);
  }

  private async updateRestaurantStatusForStaff(
    accountId: string,
    status: RestaurantStatus
  ): Promise<StaffRestaurantSummary | null> {
    return this.updateRestaurantStatus({ accountId }, status);
  }

  public async setRestaurantStatus(
    restaurantId: number,
    status: RestaurantStatus
  ): Promise<StaffRestaurantSummary | null> {
    return this.updateRestaurantStatus({ restaurantId }, status);
  }

  private async updateRestaurantStatus(
    scope: { accountId?: string; restaurantId?: number },
    status: RestaurantStatus
  ): Promise<StaffRestaurantSummary | null> {
    const values: unknown[] = [status];
    const conditions: string[] = [];

    if (scope.restaurantId !== undefined) {
      values.push(scope.restaurantId);
      conditions.push(`r."restaurantID" = $${values.length}`);
    }

    if (scope.accountId !== undefined) {
      values.push(scope.accountId);
      conditions.push(
        `EXISTS (
           SELECT 1
           FROM public."RestaurantStaff" rs
           WHERE rs."restaurantID" = r."restaurantID"
             AND rs."accountID" = $${values.length}
         )`
      );
    }

    const result = await this.query(
      `UPDATE public."Restaurant" r
       SET "restaurantStatus" = $1
       WHERE ${conditions.join(' AND ')}
       RETURNING r."restaurantID", r."restaurantName", r."restaurantStatus";`,
      values
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const restaurantId = parseId(row.restaurantID, 'restaurantID');
    if (typeof row.restaurantName !== 'string' || typeof row.restaurantStatus !== 'string') {
      throw new Error(`Invalid restaurant data returned for restaurant ${restaurantId}.`);
    }

    const menu = await this.menuService.getMenuForRestaurant(restaurantId);
    return {
      restaurantId,
      restaurantName: row.restaurantName,
      status: parseRestaurantStatus(row.restaurantStatus, restaurantId),
      menuItems: menu.items,
    };
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
