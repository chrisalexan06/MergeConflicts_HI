import type { Pool } from "pg";
import { Order } from "../../domain/ORD/Order.js";
import { OrderLine } from "../../domain/ORD/OrderLine.js";
import { OrderStatus } from "../../domain/ORD/OrderStatus.js";
import type { MenuItem, NewOrderDetails, OrderCatalog, OrderRepository, Restaurant } from "../../services/orderService.js";

interface OrderRow {
	order_id: string;
	orderStatus: string;
	created_at: Date | string;
	updated_at: Date | string;
	customerID: string;
	restaurantID: string;
	orderLineID: string | null;
	itemID: string | null;
	itemQuantity: string | null;
	unitprice: string | null;
	itemnamesnapshot: string | null;
}

interface InsertedOrderRow {
	order_id: string;
	created_at: Date | string;
	updated_at: Date | string;
}

function databaseStatusToDomain(status: string): OrderStatus {
	switch (status.toLowerCase()) {
		case "received":
		case "placed":
			return OrderStatus.PLACED;
		case "accepted":
			return OrderStatus.ACCEPTED;
		case "preparing":
			return OrderStatus.PREPARING;
		case "ready":
			return OrderStatus.READY;
		case "cancelled":
			return OrderStatus.CANCELLED;
		case "completed":
			return OrderStatus.COMPLETED;
		default:
			throw new Error(`Unsupported order status in database: ${status}`);
	}
}

function domainStatusToDatabase(status: OrderStatus): string {
	if (status === OrderStatus.PLACED) {
		return "received";
	}
	return status.toLowerCase();
}

function toOrder(rows: OrderRow[]): Order | null {
	const row = rows[0];
	if (!row) {
		return null;
	}

	const lines = rows
		.filter((line) => line.orderLineID !== null)
		.map((line) => new OrderLine(
			String(line.itemID),
			line.itemnamesnapshot!,
			Number(line.unitprice),
			Number(line.itemQuantity),
		));

	return new Order({
		id: String(row.order_id),
		customerId: String(row.customerID),
		restaurantId: String(row.restaurantID),
		lines,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	}, databaseStatusToDomain(row.orderStatus));
}

const orderSelect = `
	SELECT o.order_id, o."orderStatus", o.created_at, o.updated_at,
		o."customerID", o."restaurantID", l."orderLineID", l."itemID",
		l."itemQuantity", l.unitprice, l.itemnamesnapshot
	FROM public.orders o
	LEFT JOIN public."OrderLine" l ON l."orderID" = o.order_id
`;

export class PostgresOrderStore implements OrderRepository, OrderCatalog {
	constructor(private readonly database: Pool) {}

	async create(order: NewOrderDetails): Promise<Order> {
		const client = await this.database.connect();
		try {
			await client.query("BEGIN");
			const result = await client.query<InsertedOrderRow>(
				`INSERT INTO public.orders ("customerID", "restaurantID", "orderStatus")
				 VALUES ($1, $2, $3)
				 RETURNING order_id, created_at, updated_at`,
				[order.customerId, order.restaurantId, domainStatusToDatabase(OrderStatus.PLACED)],
			);
			const inserted = result.rows[0];
			if (!inserted) {
				throw new Error("Database did not return the created order.");
			}

			for (const line of order.lines) {
				await client.query(
					`INSERT INTO public."OrderLine" ("orderID", "itemID", "itemQuantity", unitprice, itemnamesnapshot)
					 VALUES ($1, $2, $3, $4, $5)`,
					[inserted.order_id, line.itemId, line.quantity, line.unitPrice, line.itemName],
				);
			}

			const savedOrder = new Order({
				id: String(inserted.order_id),
				customerId: order.customerId,
				restaurantId: order.restaurantId,
				lines: [...order.lines],
				createdAt: new Date(inserted.created_at),
				updatedAt: new Date(inserted.updated_at),
			});
			await client.query("COMMIT");
			return savedOrder;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	async updateStatus(order: Order, expectedStatus: OrderStatus): Promise<boolean> {
		const result = await this.database.query(
			`UPDATE public.orders
			 SET "orderStatus" = $2, updated_at = $3
			 WHERE order_id = $1 AND "orderStatus" = $4`,
			[order.id, domainStatusToDatabase(order.status), order.updatedAt, domainStatusToDatabase(expectedStatus)],
		);
		return result.rowCount === 1;
	}

	async findById(orderId: string): Promise<Order | null> {
		const result = await this.database.query<OrderRow>(
			`${orderSelect} WHERE o.order_id = $1 ORDER BY l."orderLineID"`,
			[orderId],
		);
		return toOrder(result.rows);
	}

	async findByCustomerId(customerId: string): Promise<Order[]> {
		const result = await this.database.query<OrderRow>(
			`${orderSelect} WHERE o."customerID" = $1 ORDER BY o.created_at DESC, l."orderLineID"`,
			[customerId],
		);
		const grouped = new Map<string, OrderRow[]>();
		for (const row of result.rows) {
			const group = grouped.get(row.order_id) ?? [];
			group.push(row);
			grouped.set(row.order_id, group);
		}
		return [...grouped.values()].map((rows) => toOrder(rows)!).filter(Boolean);
	}

	async findByRestaurantId(restaurantId: string): Promise<Order[]> {
		const result = await this.database.query<OrderRow>(
			`${orderSelect} WHERE o."restaurantID" = $1 ORDER BY o.created_at DESC, l."orderLineID"`,
			[restaurantId],
		);
		const grouped = new Map<string, OrderRow[]>();
		for (const row of result.rows) {
			const group = grouped.get(row.order_id) ?? [];
			group.push(row);
			grouped.set(row.order_id, group);
		}
		return [...grouped.values()].map((rows) => toOrder(rows)!).filter(Boolean);
	}

	async findRestaurant(restaurantId: string): Promise<Restaurant | null> {
		const result = await this.database.query<{ restaurantID: string; restaurantStatus: string }>(
			`SELECT "restaurantID", "restaurantStatus" FROM public."Restaurant" WHERE "restaurantID" = $1`,
			[restaurantId],
		);
		const restaurant = result.rows[0];
		return restaurant ? {
			id: String(restaurant.restaurantID),
			isOpen: restaurant.restaurantStatus.trim().toLowerCase() === "open",
		} : null;
	}

	async findMenuItem(itemId: string): Promise<MenuItem | null> {
		const result = await this.database.query<{
			itemID: string;
			itemName: string;
			itemPrice: number;
			itemStatus: string;
			restoID: string;
		}>(
			`SELECT i."itemID", i."itemName", i."itemPrice", i."itemStatus", m."restoID"
			 FROM public."MenuItems" i
			 JOIN public."Menu" m ON m."menuID" = i."menuID"
			 WHERE i."itemID" = $1`,
			[itemId],
		);
		const item = result.rows[0];
		return item ? {
			id: String(item.itemID),
			restaurantId: String(item.restoID),
			name: item.itemName,
			unitPrice: Number(item.itemPrice),
			isAvailable: item.itemStatus.trim().toLowerCase() === "available",
		} : null;
	}
}