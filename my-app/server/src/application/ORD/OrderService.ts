import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import { Order } from '../../domain/ORD/Order.js';
import { OrderLine } from '../../domain/ORD/OrderLine.js';
import { OrderStatus } from '../../domain/ORD/OrderStatus.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import { MenuService } from './MenuService.js';
import { RestaurantService } from './RestaurantService.js';

export interface ValidatedOrderLine {
  itemId: number;
  quantity: number;
  itemName: string;
  unitPrice: number;
}

export interface ValidatedOrderData {
  customerId: number;
  restaurantId: number;
  orderLines: ValidatedOrderLine[];
}

export interface PersistedOrderLine extends ValidatedOrderLine {
  orderLineId: number;
}

export interface PlacedOrder {
  orderId: number;
  customerId: number;
  restaurantId: number;
  status: OrderStatus;
  createdAt: Date;
  orderLines: PersistedOrderLine[];
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

function parseNextId(value: unknown, table: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`Could not allocate a valid ID for ${table}.`);
  }
  return id;
}

export class OrderService {
  constructor(
    private readonly restaurantService: Pick<RestaurantService, 'loadRestaurants' | 'getRestaurantById'> =
      new RestaurantService(),
    private readonly menuService: Pick<MenuService, 'getMenuItemById'> = new MenuService(),
    private readonly connect: () => Promise<Pick<PoolClient, 'query' | 'release'>> = () => pool.connect()
  ) {}

  public async validateOrder(
    customerId: number,
    restaurantId: number,
    orderLines: OrderLine[]
  ): Promise<ValidatedOrderData> {
    await this.restaurantService.loadRestaurants();

    const restaurant = this.restaurantService.getRestaurantById(restaurantId);
    if (!restaurant) {
      throw new OrderValidationError(`Restaurant ${restaurantId} was not found.`);
    }

    if (restaurant.status === RestaurantStatus.PAUSED) {
      throw new OrderValidationError(`Restaurant ${restaurantId} is paused and cannot accept orders.`);
    }

    if (restaurant.status === RestaurantStatus.CLOSED) {
      throw new OrderValidationError(`Restaurant ${restaurantId} is closed and cannot accept orders.`);
    }

    const validatedLines: ValidatedOrderLine[] = [];
    for (const line of orderLines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
        throw new OrderValidationError(`Quantity for menu item ${line.itemId} must be a positive integer.`);
      }

      const menuItem = await this.menuService.getMenuItemById(restaurantId, line.itemId);
      if (!menuItem) {
        throw new OrderValidationError(`Menu item ${line.itemId} was not found for restaurant ${restaurantId}.`);
      }

      if (menuItem.status === MenuItemStatus.SOLD_OUT) {
        throw new OrderValidationError(`Menu item ${line.itemId} is sold out and cannot be ordered.`);
      }

      validatedLines.push({
        itemId: menuItem.itemId,
        quantity: line.quantity,
        itemName: menuItem.itemName,
        unitPrice: menuItem.price,
      });
    }

    return {
      customerId,
      restaurantId,
      orderLines: validatedLines,
    };
  }

  public async placeOrder(
    customerId: number,
    restaurantId: number,
    orderLines: OrderLine[]
  ): Promise<PlacedOrder> {
    const validatedOrder = await this.validateOrder(customerId, restaurantId, orderLines);
    const client = await this.connect();

    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE public.orders IN EXCLUSIVE MODE;');
      await client.query('LOCK TABLE public."OrderLine" IN EXCLUSIVE MODE;');

      const orderIdResult = await client.query(
        'SELECT COALESCE(MAX(order_id), 0) + 1 AS "nextId" FROM public.orders;'
      );
      const orderId = parseNextId(orderIdResult.rows[0]?.nextId, 'orders');

      const orderResult = await client.query(
        `INSERT INTO public.orders (order_id, "customerID", "restaurantID", "orderStatus")
         VALUES ($1, $2, $3, $4)
         RETURNING created_at;`,
        [orderId, validatedOrder.customerId, validatedOrder.restaurantId, OrderStatus.RECEIVED]
      );
      const createdAt = new Date(orderResult.rows[0].created_at as string | Date);

      const firstOrderLineIdResult = await client.query(
        `SELECT COALESCE(MAX("orderLineID"), 0) + 1 AS "nextId"
         FROM public."OrderLine";`
      );
      let nextOrderLineId = parseNextId(firstOrderLineIdResult.rows[0]?.nextId, 'OrderLine');
      const persistedLines: PersistedOrderLine[] = [];

      for (const line of validatedOrder.orderLines) {
        const orderLineId = nextOrderLineId;
        nextOrderLineId += 1;

        await client.query(
          `INSERT INTO public."OrderLine"
             ("orderLineID", "orderID", "itemID", "itemQuantity", "itemnamesnapshot", unitprice)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [orderLineId, orderId, line.itemId, line.quantity, line.itemName, line.unitPrice]
        );

        persistedLines.push({ ...line, orderLineId });
      }

      await client.query('COMMIT');

      const order = new Order(
        orderId,
        validatedOrder.customerId,
        validatedOrder.restaurantId,
        validatedOrder.orderLines.map((line) => new OrderLine(line.itemId, line.quantity)),
        OrderStatus.RECEIVED
      );

      return {
        orderId,
        customerId: order.customerId,
        restaurantId: order.restaurantId,
        status: order.status,
        createdAt,
        orderLines: persistedLines,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Order persistence failed and the transaction could not be rolled back.'
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
