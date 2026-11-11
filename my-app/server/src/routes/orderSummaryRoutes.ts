import { Router } from 'express';
import { loadInitialCityConfiguration } from '../application/ORD/InitialCityConfiguration.js';
import { AuthenticationService } from '../application/REG/AuthenticationService.js';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import { Order } from '../domain/ORD/Order.js';
import { OrderStatus } from '../domain/ORD/OrderStatus.js';
import {
  DeliveryFeeRule,
  ServiceFeeRule,
  SmallOrderSurchargeRule,
} from '../domain/PRC/PricingRules.js';
import { FareCalculator } from '../domain/PRC/FareCalculator.js';
import { Role } from '../domain/REG/Role.js';
import type { Account } from '../domain/REG/Account.js';
import { pool } from '../db.js';
import { PostgresOrderStore } from '../infrastructure/order/PostgresOrderStore.js';
import { OrderSummaryService, type OrderSummary } from '../domain/PRC/OrderSummary.js';
import {
  PostgresOrderSummaryLedger,
  type OrderSummaryLedgerEntry,
} from '../infrastructure/PRC/PostgresOrderSummaryLedger.js';
import {
  createOrderSummaryHistoryStrategies,
  type OrderSummaryHistoryLedger,
} from '../application/PRC/OrderSummaryHistoryStrategy.js';
import {PostgresOrderRefundStore } from '../infrastructure/PRC/PostgresOrderRefundStore.js';


const authentication = new AuthenticationService(new RegistrationService());
const orderStore = new PostgresOrderStore(pool);
const { pricing } = await loadInitialCityConfiguration();
const summaryService = new OrderSummaryService(new FareCalculator([
  new DeliveryFeeRule(pricing),
  new ServiceFeeRule(pricing),
  new SmallOrderSurchargeRule(pricing),
]));
const ledger = new PostgresOrderSummaryLedger(pool);
const refundStore = new PostgresOrderRefundStore(pool);

export function resetOrderSummaryCache(): void {
  summaryService.reset();
}

export default createOrderSummaryRouter({
  getCurrentUser: (token) => authentication.getCurrentUser(token),
  findOrderById: (orderId) => orderStore.findById(orderId),
  findCourierId: async (orderId) => {
    const result = await pool.query<{ assignedCourier: string | number | null }>(
      `SELECT "assignedCourier"
       FROM public.ready_order_details
       WHERE order_id = $1`,
      [orderId],
    );
    const assignedCourier = result.rows[0]?.assignedCourier;
    return assignedCourier === null || assignedCourier === undefined
      ? null
      : String(assignedCourier);
  },
  findRestaurantId: async (accountId) => {
    const result = await pool.query<{ restaurantID: string | number }>(
      `SELECT "restaurantID"
       FROM public."RestaurantStaff"
       WHERE "accountID" = $1
       LIMIT 1`,
      [accountId],
    );
    const restaurantId = result.rows[0]?.restaurantID;
    return restaurantId === undefined ? null : String(restaurantId);
  },
  summaryService,
  ledger,
  refundDeliveredOrder: (order, summary) =>
  refundStore.refundDeliveredOrder(order, summary),

  
});


export interface OrderSummaryRouteDependencies {
  getCurrentUser(token: string): Account | null;
  findOrderById(orderId: string): Promise<Order | null>;
  findCourierId(orderId: string): Promise<string | null>;
  findRestaurantId(accountId: string): Promise<string | null>;
  summaryService: OrderSummaryService;
  ledger: OrderSummaryHistoryLedger & {
    record(summary: OrderSummary): Promise<void>;
  };
  refundDeliveredOrder(order: Order, summary: OrderSummary): Promise<boolean>;
}

export function createOrderSummaryRouter(dependencies: OrderSummaryRouteDependencies) {
  const router = Router();

  const historyStrategies = createOrderSummaryHistoryStrategies();

router.get('/history', async (request, response) => {
  try {
    const token = request.headers.authorization
      ?.replace(/^Bearer\s+/i, '')
      .trim();
    const account = token ? dependencies.getCurrentUser(token) : null;

    if (!account) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const history = await historyStrategies[account.role].getHistory(account, {
      ledger: dependencies.ledger,
      findRestaurantId: dependencies.findRestaurantId,
    });

    if (history === null) {
      response.status(403).json({
        error: 'No restaurant is associated with this account.',
      });
      return;
    }

    response.json(history);
  } catch (error) {
    console.error('Order summary history request failed:', error);
    response.status(500).json({
      error: 'An unexpected ledger history error occurred.',
    });
  }
});


  router.post('/:orderId/refund', async (request, response) => {
  try {
    const token = request.headers.authorization
      ?.replace(/^Bearer\s+/i, '')
      .trim();
    const account = token ? dependencies.getCurrentUser(token) : null;

    if (!account) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (account.role !== Role.OPERATOR) {
      response.status(403).json({ error: 'Only an operator may refund an order.' });
      return;
    }

    const order = await dependencies.findOrderById(String(request.params.orderId));
    if (!order) {
      response.status(404).json({ error: 'Order was not found.' });
      return;
    }
    if (order.status !== OrderStatus.DELIVERED) {
      response.status(409).json({ error: 'Only delivered orders can be refunded.' });
      return;
    }

    const summary = dependencies.summaryService.summarize(order);
    order.refund();

    const refunded = await dependencies.refundDeliveredOrder(order, summary);
    if (!refunded) {
      response.status(409).json({
        error: 'Order status changed before the refund could be recorded.',
      });
      return;
    }

    response.json({ orderId: order.id, status: order.status });
  } catch (error) {
    console.error('Order refund request failed:', error);
    response.status(500).json({ error: 'An unexpected order refund error occurred.' });
  }
});

  router.get('/:orderId', async (request, response) => {
    try {
      const token = request.headers.authorization
        ?.replace(/^Bearer\s+/i, '')
        .trim();
      const account = token ? dependencies.getCurrentUser(token) : null;
      if (!account) {
        response.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const order = await dependencies.findOrderById(String(request.params.orderId));
      if (!order) {
        response.status(404).json({ error: 'Order was not found.' });
        return;
      }

      let courierId = order.courierId ?? null;
      let mayView = false;
      switch (account.role) {
        case Role.CUSTOMER:
          mayView = order.customerId === String(account.accountID);
          break;
        case Role.RESTAURANT: {
          const restaurantId = await dependencies.findRestaurantId(String(account.accountID));
          mayView = restaurantId === order.restaurantId;
          break;
        }
        case Role.COURIER:
          courierId = await dependencies.findCourierId(order.id);
          mayView = courierId === String(account.accountID);
          break;
        case Role.OPERATOR:
          mayView = true;
          break;
      }

      if (!mayView) {
        response.status(403).json({ error: 'You may not view this order summary.' });
        return;
      }
      if (order.status !== OrderStatus.DELIVERED) {
        response.status(409).json({ error: 'An order summary is available only after delivery.' });
        return;
      }

      if (courierId === null) {
        courierId = await dependencies.findCourierId(order.id);
      }
      const summary = dependencies.summaryService.summarize(order, courierId);
      await dependencies.ledger.record(summary);
      response.json(summary);
    } catch (error) {
      console.error('Order summary request failed:', error);
      response.status(500).json({ error: 'An unexpected order summary error occurred.' });
    }
  }
);


  return router;
}
