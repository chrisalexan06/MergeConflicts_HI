import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "../domain/REG/Role.js";
import { Order } from "../domain/ORD/Order.js";
import type { OrderStatusChange } from "../domain/ORD/Order.js";
import { OrderLine } from "../domain/ORD/OrderLine.js";
import { OrderStatus } from "../domain/ORD/OrderStatus.js";
import {
	OrderService,
	OrderServiceError,
	type AuthenticatedUser,
	type NewOrderDetails,
	type OrderServiceDependencies,
} from "./orderService.js";

interface HarnessOptions {
	user?: AuthenticatedUser | null;
	customerProfile?: { deliveryAddress: string; city: string; country: string } | null;
	restaurantExists?: boolean;
	restaurantOpen?: boolean;
	itemExists?: boolean;
	itemRestaurantId?: string;
	itemAvailable?: boolean;
	existingOrder?: Order;
	existingOrders?: Order[];
	updateSucceeds?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
	let user = options.user === undefined ? { id: "customer-1", role: Role.CUSTOMER } : options.user;
	let nextOrderId = 1;
	const savedOrders = new Map<string, Order>();
	const persistedStatuses = new Map<string, OrderStatus>();
	const createdOrders: Order[] = [];
	const persistedTransitions: OrderStatusChange[] = [];
	let statusUpdateCount = 0;
	for (const order of [options.existingOrder, ...(options.existingOrders ?? [])]) {
		if (order) {
			savedOrders.set(order.id, order);
			persistedStatuses.set(order.id, order.status);
		}
	}

	const dependencies: OrderServiceDependencies = {
		authentication: { getCurrentUser: async () => user },
		catalog: {
			findCustomerProfile: async () => options.customerProfile === undefined
				? {
					deliveryAddress: "1455 De Maisonneuve Blvd W",
					city: "Paris",
					country: "France",
				}
				: options.customerProfile,
			findRestaurant: async (id) => options.restaurantExists !== false && id === "restaurant-1"
				? { id, isOpen: options.restaurantOpen ?? true }
				: null,
			findMenuItem: async (id) => options.itemExists !== false && id === "item-1"
				? {
					id,
					restaurantId: options.itemRestaurantId ?? "restaurant-1",
					name: "Cake",
					unitPrice: 4.5,
					isAvailable: options.itemAvailable ?? true,
				}
				: null,
		},
		orders: {
			create: async (details: NewOrderDetails) => {
				const order = new Order({
					...details,
					id: `order-${nextOrderId++}`,
					createdAt: new Date(),
				});
				createdOrders.push(order);
				savedOrders.set(order.id, order);
				persistedStatuses.set(order.id, order.status);
				return order;
			},
			updateStatus: async (order, expectedStatus, transitionEvents) => {
				statusUpdateCount += 1;
				if (options.updateSucceeds === false || persistedStatuses.get(order.id) !== expectedStatus) {
					return false;
				}
				persistedTransitions.push(...(transitionEvents ?? []));
				savedOrders.set(order.id, order);
				persistedStatuses.set(order.id, order.status);
				return true;
			},
			findById: async (id) => savedOrders.get(id) ?? null,
			findByCustomerId: async (id) => [...savedOrders.values()].filter((order) => order.customerId === id),
			findByRestaurantId: async (id) => [...savedOrders.values()].filter((order) => order.restaurantId === id),
		},
	};

	return {
		service: new OrderService(dependencies),
		createdOrders,
		persistedTransitions,
		savedOrders,
		get statusUpdateCount() {
			return statusUpdateCount;
		},
		setUser(nextUser: AuthenticatedUser | null) {
			user = nextUser;
		},
	};
}

const validRequest = {
	restaurantId: "restaurant-1",
	lines: [{ itemId: "item-1", quantity: 2 }],
};

describe("OrderService", () => {
	it("creates a placed order using catalog prices", async () => {
		const harness = createHarness();
		const order = await harness.service.placeOrder(validRequest);

		assert.equal(order.status, OrderStatus.PLACED);
		assert.equal(order.total, 9);
		assert.equal(order.customerId, "customer-1");
		assert.equal(harness.createdOrders.length, 1);
	});

	it("requires a saved delivery address before creating an order", async () => {
		for (const customerProfile of [
			{ deliveryAddress: "", city: "Paris", country: "France" },
			{ deliveryAddress: "123 Main St", city: "Paris", country: "France" },
			{ deliveryAddress: "1 Main St", city: "", country: "France" },
			{ deliveryAddress: "1 Main St", city: "Paris", country: "" },
			{ deliveryAddress: "1 Main St", city: "Montreal", country: "Canada" },
		]) {
			const harness = createHarness({ customerProfile });

			await assert.rejects(
				() => harness.service.placeOrder(validRequest),
				{ code: "CONFLICT", message: "Complete and save your delivery address, city, and country before ordering." },
			);
			assert.equal(harness.createdOrders.length, 0);
		}
	});

	it("rejects unauthenticated users and non-customer roles", async () => {
		const signedOut = createHarness({ user: null });
		await assert.rejects(() => signedOut.service.placeOrder(validRequest), { code: "UNAUTHENTICATED" });

		const staff = createHarness({ user: { id: "staff-1", role: Role.RESTAURANT } });
		await assert.rejects(() => staff.service.placeOrder(validRequest), { code: "FORBIDDEN" });
	});

	it("rejects invalid quantity, closed restaurants, and unavailable items without saving", async () => {
		const invalidQuantity = createHarness();
		await assert.rejects(
			() => invalidQuantity.service.placeOrder({ ...validRequest, lines: [{ itemId: "item-1", quantity: 0 }] }),
			{ code: "VALIDATION" },
		);

		const closedRestaurant = createHarness({ restaurantOpen: false });
		await assert.rejects(() => closedRestaurant.service.placeOrder(validRequest), { code: "CONFLICT" });

		const unavailableItem = createHarness({ itemAvailable: false });
		await assert.rejects(() => unavailableItem.service.placeOrder(validRequest), { code: "CONFLICT" });

		assert.equal(invalidQuantity.createdOrders.length, 0);
		assert.equal(closedRestaurant.createdOrders.length, 0);
		assert.equal(unavailableItem.createdOrders.length, 0);
	});

	it("rejects empty orders and missing or cross-restaurant catalog records", async () => {
		const emptyOrder = createHarness();
		await assert.rejects(
			() => emptyOrder.service.placeOrder({ ...validRequest, lines: [] }),
			{ code: "VALIDATION" },
		);

		const missingRestaurant = createHarness({ restaurantExists: false });
		await assert.rejects(() => missingRestaurant.service.placeOrder(validRequest), { code: "NOT_FOUND" });

		const missingItem = createHarness({ itemExists: false });
		await assert.rejects(() => missingItem.service.placeOrder(validRequest), { code: "NOT_FOUND" });

		const itemAtAnotherRestaurant = createHarness({ itemRestaurantId: "restaurant-2" });
		await assert.rejects(() => itemAtAnotherRestaurant.service.placeOrder(validRequest), { code: "NOT_FOUND" });

		assert.equal(emptyOrder.createdOrders.length, 0);
		assert.equal(missingRestaurant.createdOrders.length, 0);
		assert.equal(missingItem.createdOrders.length, 0);
		assert.equal(itemAtAnotherRestaurant.createdOrders.length, 0);
	});

	it("cancels the customer's placed order and rejects repeat cancellation", async () => {
		const harness = createHarness();
		const order = await harness.service.placeOrder(validRequest);

		assert.equal((await harness.service.cancelOrder(order.id)).status, OrderStatus.CANCELLED);
		assert.deepEqual(
			harness.persistedTransitions.map(({ previousStatus, status }) => [previousStatus, status]),
			[[OrderStatus.PLACED, OrderStatus.CANCELLED]],
		);
		await assert.rejects(() => harness.service.cancelOrder(order.id), { code: "CONFLICT" });
	});

	it("rejects cancellation after the restaurant has accepted the order", async () => {
		const acceptedOrder = new Order({
			id: "order-accepted",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		}, OrderStatus.ACCEPTED);
		const harness = createHarness({ existingOrder: acceptedOrder });

		await assert.rejects(() => harness.service.cancelOrder(acceptedOrder.id), { code: "CONFLICT" });
		assert.equal(harness.savedOrders.get(acceptedOrder.id)?.status, OrderStatus.ACCEPTED);
	});

	it("allows assigned restaurant staff to advance an order through ready", async () => {
		const customer = createHarness();
		const placedOrder = await customer.service.placeOrder(validRequest);
		const staff = createHarness({
			user: { id: "staff-1", role: Role.RESTAURANT, restaurantId: "restaurant-1" },
			existingOrder: placedOrder,
		});

		assert.deepEqual(await staff.service.getRestaurantOrders(), [placedOrder]);
		assert.equal((await staff.service.acceptOrder(placedOrder.id)).status, OrderStatus.ACCEPTED);
		assert.equal((await staff.service.startPreparingOrder(placedOrder.id)).status, OrderStatus.PREPARING);
		assert.equal((await staff.service.markOrderReady(placedOrder.id)).status, OrderStatus.READY);
		assert.deepEqual(
			staff.persistedTransitions.map(({ previousStatus, status }) => [previousStatus, status]),
			[
				[OrderStatus.PLACED, OrderStatus.ACCEPTED],
				[OrderStatus.ACCEPTED, OrderStatus.PREPARING],
				[OrderStatus.PREPARING, OrderStatus.READY],
			],
		);
	});

	it("starts accepted orders in arrival order without blocking the next order on preparation capacity", async () => {
		const firstOrder = new Order({
			id: "order-1",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date("2026-10-15T12:00:00Z"),
		}, OrderStatus.ACCEPTED);
		const secondOrder = new Order({
			id: "order-2",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date("2026-10-15T12:01:00Z"),
		}, OrderStatus.ACCEPTED);
		const staff = createHarness({
			user: { id: "staff-1", role: Role.RESTAURANT, restaurantId: "restaurant-1" },
			existingOrders: [secondOrder, firstOrder],
		});

		await assert.rejects(() => staff.service.startPreparingOrder(secondOrder.id), {
			code: "CONFLICT",
			message: "Accepted orders must be prepared in arrival order.",
		});
		assert.equal((await staff.service.startPreparingOrder(firstOrder.id)).status, OrderStatus.PREPARING);
		assert.equal((await staff.service.startPreparingOrder(secondOrder.id)).status, OrderStatus.PREPARING);
	});

	it("restricts restaurant transitions to assigned staff and valid states", async () => {
		const customer = createHarness();
		const placedOrder = await customer.service.placeOrder(validRequest);
		await assert.rejects(() => customer.service.acceptOrder(placedOrder.id), { code: "FORBIDDEN" });

		const otherRestaurant = createHarness({
			user: { id: "staff-2", role: Role.RESTAURANT, restaurantId: "restaurant-2" },
			existingOrder: placedOrder,
		});
		await assert.rejects(() => otherRestaurant.service.acceptOrder(placedOrder.id), { code: "NOT_FOUND" });

		const unassignedStaff = createHarness({
			user: { id: "staff-3", role: Role.RESTAURANT },
		});
		await assert.rejects(() => unassignedStaff.service.getRestaurantOrders(), { code: "FORBIDDEN" });

		const staff = createHarness({
			user: { id: "staff-1", role: Role.RESTAURANT, restaurantId: "restaurant-1" },
			existingOrder: placedOrder,
		});
		await assert.rejects(() => staff.service.startPreparingOrder(placedOrder.id), { code: "CONFLICT" });
	});

	it("allows assigned staff to cancel before ready but not after ready", async () => {
		const preparingOrder = new Order({
			id: "order-preparing",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		}, OrderStatus.PREPARING);
		const staff = createHarness({
			user: { id: "staff-1", role: Role.RESTAURANT, restaurantId: "restaurant-1" },
			existingOrder: preparingOrder,
		});
		assert.equal((await staff.service.cancelRestaurantOrder(preparingOrder.id)).status, OrderStatus.CANCELLED);

		const readyOrder = new Order({
			id: "order-ready",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		}, OrderStatus.READY);
		const readyStaff = createHarness({
			user: { id: "staff-1", role: Role.RESTAURANT, restaurantId: "restaurant-1" },
			existingOrder: readyOrder,
		});
		await assert.rejects(() => readyStaff.service.cancelRestaurantOrder(readyOrder.id), { code: "CONFLICT" });
	});

	it("hides another customer's order and detects a concurrent status change", async () => {
		const otherCustomerOrder = new Order({
			id: "order-other",
			customerId: "customer-2",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		});
		const otherCustomer = createHarness({ existingOrder: otherCustomerOrder });
		await assert.rejects(() => otherCustomer.service.getOrder(otherCustomerOrder.id), { code: "NOT_FOUND" });

		const conflictOrder = new Order({
			id: "order-1",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		});
		const concurrentChange = createHarness({ existingOrder: conflictOrder, updateSucceeds: false });
		await assert.rejects(() => concurrentChange.service.cancelOrder(conflictOrder.id), { code: "CONFLICT" });
	});

	it("tracks the customer's order without changing its state", async () => {
		const preparingOrder = new Order({
			id: "order-preparing",
			customerId: "customer-1",
			restaurantId: "restaurant-1",
			lines: [new OrderLine("item-1", "Cake", 4.5, 1)],
			createdAt: new Date(),
		}, OrderStatus.PREPARING);
		const harness = createHarness({ existingOrder: preparingOrder });

		const trackedOrder = await harness.service.getOrder(preparingOrder.id);

		assert.equal(trackedOrder.status, OrderStatus.PREPARING);
		assert.equal(harness.savedOrders.get(preparingOrder.id)?.status, OrderStatus.PREPARING);
		assert.equal(harness.statusUpdateCount, 0);
	});
});