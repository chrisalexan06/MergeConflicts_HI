import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool } from "pg";
import { OrderLine } from "../../domain/ORD/OrderLine.js";
import { OrderStatus } from "../../domain/ORD/OrderStatus.js";
import { PostgresOrderStore } from "./PostgresOrderStore.js";

interface QueryCall {
	sql: string;
	values?: unknown[];
}

function asPool(value: unknown): Pool {
	return value as Pool;
}

describe("PostgresOrderStore", () => {
	it("creates the order and its lines in one transaction", async () => {
		const calls: QueryCall[] = [];
		let released = false;
		const client = {
			query: async (sql: string, values?: unknown[]) => {
				calls.push({ sql, values });
				if (sql.includes("INSERT INTO public.orders")) {
					return {
						rows: [{ order_id: "81", created_at: new Date("2026-10-15T12:00:00Z"), updated_at: new Date("2026-10-15T12:00:00Z") }],
						rowCount: 1,
					};
				}
				return { rows: [], rowCount: 1 };
			},
			release: () => { released = true; },
		};
		const database = {
			connect: async () => client,
			query: async () => ({ rows: [], rowCount: 0 }),
		};
		const store = new PostgresOrderStore(asPool(database));

		const order = await store.create({
			customerId: "12",
			restaurantId: "7",
			lines: [new OrderLine("3", "Cake", 4.5, 2)],
		});

		assert.equal(order.id, "81");
		assert.equal(order.status, OrderStatus.PLACED);
		assert.deepEqual(calls.map((call) => call.sql.trim().split(/\s+/)[0]), ["BEGIN", "INSERT", "INSERT", "COMMIT"]);
		assert.deepEqual(calls[1].values, ["12", "7", "placed"]);
		assert.deepEqual(calls[2].values, ["81", "3", 2, 4.5, "Cake"]);
		assert.equal(released, true);
	});

	it("rolls back a partial order when an order-line insert fails", async () => {
		const calls: string[] = [];
		let released = false;
		const client = {
			query: async (sql: string) => {
				calls.push(sql.trim().split(/\s+/)[0]);
				if (sql.includes('INSERT INTO public."OrderLine"')) {
					throw new Error("line insert failed");
				}
				if (sql.includes("INSERT INTO public.orders")) {
					return { rows: [{ order_id: "81", created_at: new Date(), updated_at: new Date() }], rowCount: 1 };
				}
				return { rows: [], rowCount: 1 };
			},
			release: () => { released = true; },
		};
		const store = new PostgresOrderStore(asPool({ connect: async () => client, query: async () => ({ rows: [], rowCount: 0 }) }));

		await assert.rejects(() => store.create({
			customerId: "12",
			restaurantId: "7",
			lines: [new OrderLine("3", "Cake", 4.5, 1)],
		}), /line insert failed/);
		assert.deepEqual(calls, ["BEGIN", "INSERT", "INSERT", "ROLLBACK"]);
		assert.equal(released, true);
	});

	it("maps persisted orders, restaurant status, and menu availability", async () => {
		const database = {
			connect: async () => { throw new Error("Unexpected connection"); },
			query: async (sql: string) => {
				if (sql.includes("FROM public.orders")) {
					return {
						rows: [{
							order_id: "81",
							orderStatus: "received",
							created_at: "2026-10-15T12:00:00Z",
							updated_at: "2026-10-15T12:00:00Z",
							customerID: "12",
							restaurantID: "7",
							orderLineID: "101",
							itemID: "3",
							itemQuantity: "2",
							unitprice: "4.50",
							itemnamesnapshot: "Cake",
						}],
						rowCount: 1,
					};
				}
				if (sql.includes('FROM public."Restaurant"')) {
					return { rows: [{ restaurantID: "7", restaurantStatus: "open" }], rowCount: 1 };
				}
				return {
					rows: [{ itemID: "3", itemName: "Cake", itemPrice: 4.5, itemStatus: "available", restoID: "7" }],
					rowCount: 1,
				};
			},
		};
		const store = new PostgresOrderStore(asPool(database));

		const order = await store.findById("81");
		const restaurant = await store.findRestaurant("7");
		const item = await store.findMenuItem("3");
		assert.equal(order?.status, OrderStatus.PLACED);
		assert.equal(order?.total, 9);
		assert.equal(restaurant?.isOpen, true);
		assert.equal(item?.isAvailable, true);
	});

	it("round-trips every persisted lifecycle status", async () => {
		for (const [databaseStatus, expectedStatus] of [
			["received", OrderStatus.PLACED],
			["placed", OrderStatus.PLACED],
			["accepted", OrderStatus.ACCEPTED],
			["preparing", OrderStatus.PREPARING],
			["ready", OrderStatus.READY],
			["cancelled", OrderStatus.CANCELLED],
			["completed", OrderStatus.COMPLETED],
		] as const) {
			const database = {
				connect: async () => { throw new Error("Unexpected connection"); },
				query: async () => ({
					rows: [{
						order_id: "81",
						orderStatus: databaseStatus,
						created_at: "2026-10-15T12:00:00Z",
						updated_at: "2026-10-15T12:00:00Z",
						customerID: "12",
						restaurantID: "7",
						orderLineID: "101",
						itemID: "3",
						itemQuantity: "1",
						unitprice: "4.50",
						itemnamesnapshot: "Cake",
					}],
					rowCount: 1,
				}),
			};
			const store = new PostgresOrderStore(asPool(database));
			assert.equal((await store.findById("81"))?.status, expectedStatus);
		}
	});

	it("persists status transitions with compare-and-set semantics", async () => {
		const order = new (await import("../../domain/ORD/Order.js")).Order({
			id: "81",
			customerId: "12",
			restaurantId: "7",
			lines: [new OrderLine("3", "Cake", 4.5, 1)],
			createdAt: new Date("2026-10-15T12:00:00Z"),
		});
		order.cancel();
		let queryText = "";
		let queryValues: unknown[] = [];
		const store = new PostgresOrderStore(asPool({
			connect: async () => { throw new Error("Unexpected connection"); },
			query: async (sql: string, values: unknown[]) => {
				queryText = sql;
				queryValues = values;
				return { rows: [], rowCount: 1 };
			},
		}));

		assert.equal(await store.updateStatus(order, OrderStatus.PLACED), true);
		assert.match(queryText, /"orderStatus" = \$4/);
		assert.deepEqual(queryValues, ["81", "cancelled", order.updatedAt, "placed"]);
		assert.match(queryText, /earlier\."orderStatus" = 'accepted'/);
		assert.match(queryText, /earlier\.created_at, earlier\.order_id/);
	});

	it("reports a lost status race when no row matches the expected state", async () => {
		const order = new (await import("../../domain/ORD/Order.js")).Order({
			id: "81",
			customerId: "12",
			restaurantId: "7",
			lines: [new OrderLine("3", "Cake", 4.5, 1)],
			createdAt: new Date(),
		});
		order.cancel();
		const store = new PostgresOrderStore(asPool({
			connect: async () => { throw new Error("Unexpected connection"); },
			query: async () => ({ rows: [], rowCount: 0 }),
		}));

		assert.equal(await store.updateStatus(order, OrderStatus.PLACED), false);
	});
});