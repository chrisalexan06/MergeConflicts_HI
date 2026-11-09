import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { before, describe, it } from 'node:test';
import express from 'express';
import { loadInitialCityConfiguration } from '../../application/ORD/InitialCityConfiguration.js';
import { Order } from '../ORD/Order.js';
import { OrderLine } from '../ORD/OrderLine.js';
import {
  CourierAccount,
  CustomerAccount,
  OperatorAccount,
  RestaurantStaffAccount,
  type Account,
} from '../REG/Account.js';
import { FareCalculator } from './FareCalculator.js';
import {
  DeliveryFeeRule,
  ServiceFeeRule,
  SmallOrderSurchargeRule,
} from './PricingRules.js';
import { OrderSummaryService } from './OrderSummary.js';
import type { OrderSummaryRouteDependencies } from '../../routes/orderSummaryRoutes.js';
import type { OrderSummary } from './OrderSummary.js';

type RouterFactory = typeof import('../../routes/orderSummaryRoutes.js').createOrderSummaryRouter;
let createOrderSummaryRouter: RouterFactory;

before(async () => {
  process.env.DATABASE_URL ??= 'postgres://localhost/order-summary-test';
  ({ createOrderSummaryRouter } = await import('../../routes/orderSummaryRoutes.js'));
});

function createOrder(delivered: boolean): Order {
  const order = new Order({
    id: '1',
    customerId: '1',
    restaurantId: '1',
    lines: [new OrderLine('1', 'Cake', 8, 2)],
    createdAt: new Date('2026-10-15T12:00:00.000Z'),
  });
  if (delivered) {
    order.accept();
    order.startPreparing();
    order.markReady();
    order.assignCourier('3');
    order.confirmPickup('3');
    order.confirmDelivery('3');
  }
  return order;
}

async function createDependencies(account: Account, order: Order | null): Promise<OrderSummaryRouteDependencies> {
  const { pricing } = await loadInitialCityConfiguration();
  return {
    ledger: {record:async () => {}},
    getCurrentUser: (token) => token === 'valid-token' ? account : null,
    findOrderById: async () => order,
    findCourierId: async () => '3',
    findRestaurantId: async () => '1',
    summaryService: new OrderSummaryService(new FareCalculator([
      new DeliveryFeeRule(pricing),
      new ServiceFeeRule(pricing),
      new SmallOrderSurchargeRule(pricing),
    ])),
  };
}

async function requestSummary(
  account: Account,
  order: Order | null,
  recordedSummaries: OrderSummary[] = [],
): Promise<Response> {
  const app = express();
  const dependencies = await createDependencies(account, order);
  dependencies.ledger = {
    record: async (summary) => {
      recordedSummaries.push(summary);
    },
  };

  app.use('/api/order-summaries', createOrderSummaryRouter(dependencies));

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to a TCP port.');
    }
    return await fetch(`http://127.0.0.1:${address.port}/api/order-summaries/1`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('Order summary route', () => {
  it('returns 404 for an unknown order', async () => {
    const response = await requestSummary(
      new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
      null,
    );
    assert.equal(response.status, 404);
  });

  it('returns 409 while an authorized order is undelivered', async () => {
    const response = await requestSummary(
      new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
      createOrder(false),
    );
    assert.equal(response.status, 409);
  });

  it('returns 200 with a delivered summary', async () => {
    const recordedSummaries: OrderSummary[] = [];
    const response = await requestSummary(
      new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
      createOrder(true),
      recordedSummaries
    );

    const summary = await response.json() as { orderId: string; courierId: string };

    assert.equal(response.status, 200);
    assert.equal(summary.orderId, '1');
    assert.equal(summary.courierId, '3');
    assert.equal(recordedSummaries.length, 1);
    assert.equal(recordedSummaries[0]?.orderId, '1');
  });

  it('returns 403 to a role or account not associated with the order', async () => {
    const response = await requestSummary(
      new CustomerAccount(9, 'other', 'password', 'other@example.com'),
      createOrder(true),
    );
    assert.equal(response.status, 403);
  });

  it('allows the associated restaurant, courier, and operator', async () => {
    const allowedAccounts = [
      new RestaurantStaffAccount(2, 'restaurant', 'password', 'restaurant@example.com', 1),
      new CourierAccount(3, 'courier', 'password', 'courier@example.com'),
      new OperatorAccount(4, 'operator', 'password', 'operator@example.com'),
    ];

    for (const account of allowedAccounts) {
      const response = await requestSummary(account, createOrder(true));
      assert.equal(response.status, 200, `${account.role} should be allowed`);
      await response.json();
    }
  });
});
