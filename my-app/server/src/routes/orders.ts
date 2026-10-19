import { Router, type Request, type Response } from "express";
import { AuthenticationService } from "../application/REG/AuthenticationService.js";
import { RegistrationService } from "../application/REG/RegistrationService.js";
import { pool } from "../db.js";
import { Order } from "../domain/ORD/Order.js";
import { Role } from "../domain/REG/Role.js";
import { OrderService, OrderServiceError } from "../services/orderService.js";
import { PostgresOrderStore } from "../infrastructure/order/PostgresOrderStore.js";

const router = Router();
const authentication = new AuthenticationService(new RegistrationService());
const store = new PostgresOrderStore(pool);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function createOrderService(request: Request): OrderService {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const account = token ? authentication.getCurrentUser(token) : null;
  return new OrderService({
    authentication: {
      getCurrentUser: async () => {
        if (!account) {
          return null;
        }

        let restaurantId: string | null = null;
        if (account.role === Role.RESTAURANT) {
          const result = await pool.query<{ restaurantID: string | number }>(
            `SELECT "restaurantID" FROM public."RestaurantStaff" WHERE "accountID" = $1 LIMIT 1`,
            [account.accountID],
          );
          const assignment = result.rows[0];
          restaurantId = assignment ? String(assignment.restaurantID) : null;
        }

        return {
          id: String(account.accountID),
          role: account.role,
          restaurantId,
        };
      },
    },
    catalog: store,
    orders: store,
  });
}

function serializeOrder(order: Order) {
  return {
    orderId: Number(order.id),
    orderStatus: order.status.toLowerCase(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customerId: Number(order.customerId),
    restaurantId: Number(order.restaurantId),
    total: order.total,
    items: order.lines.map((line) => ({
      itemId: Number(line.itemId),
      itemName: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  };
}

function sendError(response: Response, error: unknown): void {
  if (error instanceof OrderServiceError) {
    const status = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      VALIDATION: 400,
      NOT_FOUND: 404,
      CONFLICT: 409,
    }[error.code];
    response.status(status).json({ error: error.message });
    return;
  }

  console.error("Order request failed:", error);
  response.status(500).json({ error: "An unexpected order error occurred." });
}

router.post("/", async (request, response) => {
  const body: unknown = request.body;
  if (!isRecord(body)
    || !isPositiveInteger(body.restaurantId)
    || !Array.isArray(body.orderLines)
    || body.orderLines.length === 0
    || !body.orderLines.every((line) => isRecord(line)
      && isPositiveInteger(line.itemId)
      && isPositiveInteger(line.quantity))) {
    response.status(400).json({ error: "Choose a restaurant and provide items with positive integer quantities." });
    return;
  }

  try {
    const order = await createOrderService(request).placeOrder({
      restaurantId: String(body.restaurantId),
      lines: body.orderLines.map((line) => ({
        itemId: String((line as Record<string, number>).itemId),
        quantity: (line as Record<string, number>).quantity,
      })),
    });
    response.status(201).json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/", async (request, response) => {
  try {
    const orders = await createOrderService(request).getCustomerOrders();
    response.json(orders.map(serializeOrder));
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/restaurant", async (request, response) => {
  try {
    const orders = await createOrderService(request).getRestaurantOrders();
    response.json(orders.map(serializeOrder));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/restaurant/:orderId/accept", async (request, response) => {
  try {
    const order = await createOrderService(request).acceptOrder(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/restaurant/:orderId/preparing", async (request, response) => {
  try {
    const order = await createOrderService(request).startPreparingOrder(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/restaurant/:orderId/ready", async (request, response) => {
  try {
    const order = await createOrderService(request).markOrderReady(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/restaurant/:orderId/cancel", async (request, response) => {
  try {
    const order = await createOrderService(request).cancelRestaurantOrder(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.get("/:orderId", async (request, response) => {
  try {
    const order = await createOrderService(request).getOrder(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

router.post("/:orderId/cancel", async (request, response) => {
  try {
    const order = await createOrderService(request).cancelOrder(String(request.params.orderId));
    response.json(serializeOrder(order));
  } catch (error) {
    sendError(response, error);
  }
});

export default router;