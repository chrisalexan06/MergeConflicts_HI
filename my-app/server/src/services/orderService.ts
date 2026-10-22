	import { Role } from "../domain/REG/Role.js";
	import { Order, type NewOrder } from "../domain/ORD/Order.js";
	import { OrderLine } from "../domain/ORD/OrderLine.js";
	import { OrderStatus } from "../domain/ORD/OrderStatus.js";

	export interface AuthenticatedUser {
		id: string;
		role: string;
		restaurantId?: string | null;
	}

	export interface AuthenticationProvider {
		getCurrentUser(): Promise<AuthenticatedUser | null>;
	}

	export interface Restaurant {
		id: string;
		isOpen: boolean;
	}

	export interface MenuItem {
		id: string;
		restaurantId: string;
		name: string;
		unitPrice: number;
		isAvailable: boolean;
	}

	export interface OrderCatalog {
		findRestaurant(restaurantId: string): Promise<Restaurant | null>;
		findMenuItem(itemId: string): Promise<MenuItem | null>;
	}

	export type NewOrderDetails = Pick<NewOrder, "customerId" | "restaurantId" | "lines">;

	export interface OrderRepository {
		create(order: NewOrderDetails): Promise<Order>;
		updateStatus(order: Order, expectedStatus: OrderStatus): Promise<boolean>;
		findById(orderId: string): Promise<Order | null>;
		findByCustomerId(customerId: string): Promise<Order[]>;
		findByRestaurantId(restaurantId: string): Promise<Order[]>;
	}

	export interface PlaceOrderRequest {
		restaurantId: string;
		lines: Array<{
			itemId: string;
			quantity: number;
		}>;
	}

	export interface OrderServiceDependencies {
		authentication: AuthenticationProvider;
		catalog: OrderCatalog;
		orders: OrderRepository;
	}

	export type OrderServiceErrorCode =
		| "UNAUTHENTICATED"
		| "FORBIDDEN"
		| "VALIDATION"
		| "NOT_FOUND"
		| "CONFLICT";

	export class OrderServiceError extends Error {
		constructor(
			public readonly code: OrderServiceErrorCode,
			message: string,
		) {
			super(message);
			this.name = "OrderServiceError";
		}
	}

	export class OrderService {
		constructor(private readonly dependencies: OrderServiceDependencies) {}

		async placeOrder(request: PlaceOrderRequest): Promise<Order> {
			const customer = await this.requireCustomer();
			if (!request.restaurantId.trim() || request.lines.length === 0) {
				throw new OrderServiceError("VALIDATION", "Choose a restaurant and at least one item.");
			}

			for (const line of request.lines) {
				if (!line.itemId.trim() || !Number.isInteger(line.quantity) || line.quantity <= 0) {
					throw new OrderServiceError("VALIDATION", "Each item must have a positive whole-number quantity.");
				}
			}

			const restaurant = await this.dependencies.catalog.findRestaurant(request.restaurantId);
			if (!restaurant) {
				throw new OrderServiceError("NOT_FOUND", "Restaurant was not found.");
			}
			if (!restaurant.isOpen) {
				throw new OrderServiceError("CONFLICT", "Restaurant is not accepting orders.");
			}

			const orderLines = await Promise.all(request.lines.map(async (requestedLine) => {
				const item = await this.dependencies.catalog.findMenuItem(requestedLine.itemId);
				if (item?.restaurantId !== restaurant.id) {
					throw new OrderServiceError("NOT_FOUND", "An item was not found at this restaurant.");
				}
				if (!item.isAvailable) {
					throw new OrderServiceError("CONFLICT", `${item.name} is not available.`);
				}
				return new OrderLine(item.id, item.name, item.unitPrice, requestedLine.quantity);
			}));

			return this.dependencies.orders.create({
				customerId: customer.id,
				restaurantId: restaurant.id,
				lines: orderLines,
			});
		}

		async cancelOrder(orderId: string): Promise<Order> {
			const customer = await this.requireCustomer();
			const order = await this.findCustomerOrder(orderId, customer.id);
			const expectedStatus = order.status;
			if (expectedStatus !== OrderStatus.PLACED) {
				throw new OrderServiceError("CONFLICT", "Only placed orders can be cancelled.");
			}

			order.cancel();
			const updated = await this.dependencies.orders.updateStatus(order, expectedStatus);
			if (!updated) {
				throw new OrderServiceError("CONFLICT", "Order status changed before it could be cancelled.");
			}
			return order;
		}

		async getOrder(orderId: string): Promise<Order> {
			const customer = await this.requireCustomer();
			return this.findCustomerOrder(orderId, customer.id);
		}

		async getCustomerOrders(): Promise<Order[]> {
			const customer = await this.requireCustomer();
			return this.dependencies.orders.findByCustomerId(customer.id);
		}

		async getRestaurantOrders(): Promise<Order[]> {
			const restaurantStaff = await this.requireRestaurantStaff();
			return this.dependencies.orders.findByRestaurantId(restaurantStaff.restaurantId!);
		}

		async acceptOrder(orderId: string): Promise<Order> {
			return this.transitionRestaurantOrder(
				orderId,
				OrderStatus.PLACED,
				(order) => order.accept(),
			);
		}

		async startPreparingOrder(orderId: string): Promise<Order> {
			return this.transitionRestaurantOrder(
				orderId,
				OrderStatus.ACCEPTED,
				(order) => order.startPreparing(),
				true,
			);
		}

		async markOrderReady(orderId: string): Promise<Order> {
			return this.transitionRestaurantOrder(
				orderId,
				OrderStatus.PREPARING,
				(order) => order.markReady(),
			);
		}

		async cancelRestaurantOrder(orderId: string): Promise<Order> {
			return this.transitionRestaurantOrder(
				orderId,
				[OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
				(order) => order.cancelByRestaurant(),
			);
		}

		private async requireCustomer(): Promise<AuthenticatedUser> {
			const user = await this.dependencies.authentication.getCurrentUser();
			if (!user) {
				throw new OrderServiceError("UNAUTHENTICATED", "Sign in to manage orders.");
			}
			if (user.role !== Role.CUSTOMER) {
				throw new OrderServiceError("FORBIDDEN", "Only customers can manage customer orders.");
			}
			return user;
		}

		private async requireRestaurantStaff(): Promise<AuthenticatedUser & { restaurantId: string }> {
			const user = await this.dependencies.authentication.getCurrentUser();
			if (!user) {
				throw new OrderServiceError("UNAUTHENTICATED", "Sign in to manage restaurant orders.");
			}
			if (user.role !== Role.RESTAURANT) {
				throw new OrderServiceError("FORBIDDEN", "Only restaurant staff can update restaurant orders.");
			}
			if (!user.restaurantId) {
				throw new OrderServiceError("FORBIDDEN", "This restaurant account is not assigned to a restaurant.");
			}
			return user as AuthenticatedUser & { restaurantId: string };
		}

		private async transitionRestaurantOrder(
			orderId: string,
			expectedStatus: OrderStatus | OrderStatus[],
			transition: (order: Order) => void,
			enforcePreparationQueue = false,
		): Promise<Order> {
			const restaurantStaff = await this.requireRestaurantStaff();
			const order = await this.dependencies.orders.findById(orderId);
			if (order?.restaurantId !== restaurantStaff.restaurantId) {
				throw new OrderServiceError("NOT_FOUND", "Order was not found for this restaurant.");
			}
			const allowedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
			if (!allowedStatuses.includes(order.status)) {
				throw new OrderServiceError("CONFLICT", `Order cannot be updated from ${order.status}.`);
			}
			if (enforcePreparationQueue) {
				const acceptedOrders = (await this.dependencies.orders.findByRestaurantId(restaurantStaff.restaurantId))
					.filter((restaurantOrder) => restaurantOrder.status === OrderStatus.ACCEPTED)
					.sort((first, second) =>
						first.createdAt.getTime() - second.createdAt.getTime()
						|| first.id.localeCompare(second.id, undefined, { numeric: true }),
					);
				if (acceptedOrders[0]?.id !== order.id) {
					throw new OrderServiceError("CONFLICT", "Accepted orders must be prepared in arrival order.");
				}
			}

			const previousStatus = order.status;
			transition(order);
			const updated = await this.dependencies.orders.updateStatus(order, previousStatus);
			if (!updated) {
				throw new OrderServiceError("CONFLICT", "Order status changed before it could be updated.");
			}
			return order;
		}

		private async findCustomerOrder(orderId: string, customerId: string): Promise<Order> {
			const order = await this.dependencies.orders.findById(orderId);
			if (order?.customerId !== customerId) {
				throw new OrderServiceError("NOT_FOUND", "Order was not found.");
			}
			return order;
		}
	}
