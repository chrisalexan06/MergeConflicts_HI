export type OrderStatus =
	| "placed"
	| "accepted"
	| "preparing"
	| "ready"
	| "completed"
	| "cancelled";

export interface OrderItem {
	itemId: number;
	itemName: string;
	quantity: number;
	unitPrice: number;
}

export interface Order {
	orderId: number;
	orderStatus: OrderStatus;
	createdAt: string;
	updatedAt: string;
	customerId: number;
	restaurantId: number;
	items: OrderItem[];
	total: number;
}

export interface MenuItem {
	itemId: number;
	name: string;
	unitPrice: number;
	isAvailable: boolean;
}

export interface PlaceOrderRequest {
	restaurantId: number;
	orderLines: Array<{
		itemId: number;
		quantity: number;
	}>;
}
