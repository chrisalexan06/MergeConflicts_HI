import { pool } from '../../db.js';
import { Menu } from '../../domain/ORD/Menu.js';
import { MenuItem } from '../../domain/ORD/MenuItem.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';

export type DatabaseQuery = (
  text: string,
  values?: unknown[]
) => Promise<{ rows: Record<string, unknown>[] }>;

interface MenuItemRow extends Record<string, unknown> {
  itemID: string | number | null;
  itemName: string | null;
  itemPrice: string | number | null;
  itemStatus: string | null;
}

function parseId(value: unknown): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Invalid itemID value returned by the database: ${String(value)}.`);
  }
  return id;
}

function parsePrice(value: unknown, itemId: number): number {
  const price = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(price)) {
    throw new Error(`Invalid itemPrice returned for menu item ${itemId}.`);
  }
  return price;
}

function parseMenuItemStatus(status: string, itemId: number): MenuItemStatus {
  switch (status.trim().toLowerCase()) {
    case MenuItemStatus.AVAILABLE:
      return MenuItemStatus.AVAILABLE;
    case MenuItemStatus.SOLD_OUT:
      return MenuItemStatus.SOLD_OUT;
    default:
      throw new Error(`Invalid itemStatus for menu item ${itemId}: ${status}.`);
  }
}

export class MenuService {
  constructor(private readonly query: DatabaseQuery = pool.query.bind(pool)) {}

  public async getMenuForRestaurant(restaurantId: number): Promise<Menu> {
    const result = await this.query(
      `SELECT mi."itemID", mi."itemName", mi."itemPrice", mi."itemStatus"
       FROM public."Menu" m
       LEFT JOIN public."MenuItems" mi ON mi."menuID" = m."menuID"
       WHERE m."restoID" = $1
       ORDER BY m."menuID", mi."itemID";`,
      [restaurantId]
    );

    const items = (result.rows as MenuItemRow[])
      .filter((row) => row.itemID !== null)
      .map((row) => {
        const itemId = parseId(row.itemID);
        if (typeof row.itemName !== 'string' || typeof row.itemStatus !== 'string'
          || row.itemPrice === null) {
          throw new Error(`Invalid menu item data returned for item ${itemId}.`);
        }

        return new MenuItem(
          itemId,
          row.itemName,
          parsePrice(row.itemPrice, itemId),
          parseMenuItemStatus(row.itemStatus, itemId)
        );
      });

    return new Menu(items);
  }

  public async getMenuItemById(restaurantId: number, itemId: number): Promise<MenuItem | undefined> {
    const menu = await this.getMenuForRestaurant(restaurantId);
    return menu.items.find((item) => item.itemId === itemId);
  }
}
