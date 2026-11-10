import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { before, describe, it } from 'node:test';
import express from 'express';
import { loadInitialCityConfiguration } from '../../application/ORD/InitialCityConfiguration.js';
import { Order } from '../ORD/Order.js';
import { OrderLine } from '../ORD/OrderLine.js';
import { OrderStatus } from '../ORD/OrderStatus.js';
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
import type { OrderSummaryLedgerEntry } from '../../infrastructure/PRC/PostgresOrderSummaryLedger.js';



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

type RefundCall = {
  order: Order;
  summary: OrderSummary;
};

async function createDependencies(
  account: Account,
  order: Order | null,
  refundCalls: RefundCall[] = [],
): Promise<OrderSummaryRouteDependencies> {
  const { pricing } = await loadInitialCityConfiguration();

  return {
    ledger: {
      record: async () => {},
      listByCustomer: async () => [],
      listByRestaurant: async () => [],
      listByCourier: async () => [],
      listAll: async () => [],
    },
    getCurrentUser: (token) => token === 'valid-token' ? account : null,
    findOrderById: async () => order,
    findCourierId: async () => '3',
    findRestaurantId: async () => '1',
    refundDeliveredOrder: async (refundedOrder, summary) => {
      refundCalls.push({ order: refundedOrder, summary });
      return true;
    },
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
    listByCustomer: async () => [],
    listByRestaurant: async () => [],
    listByCourier: async () => [],
    listAll: async () => [],
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

async function requestRefund(
  account: Account,
  order: Order | null,
  refundCalls: RefundCall[] = [],
  authenticated = true,
): Promise<Response> {
  const app = express();
  const dependencies = await createDependencies(account, order, refundCalls);
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

    return await fetch(
      `http://127.0.0.1:${address.port}/api/order-summaries/1/refund`,
      authenticated ? { method: 'POST', headers: { Authorization: 'Bearer valid-token' } }
        : { method: 'POST' },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

type HistoryLedgerCall =
  | { method: 'listByCustomer'; id: string }
  | { method: 'listByRestaurant'; id: string }
  | { method: 'listByCourier'; id: string }
  | { method: 'listAll' };

async function requestHistory(
  account: Account,
  calls: HistoryLedgerCall[],
  authenticated = true,
): Promise<Response> {
  const app = express();
  const dependencies = await createDependencies(account, createOrder(true));

  dependencies.ledger = {
    record: async () => {},
    listByCustomer: async (id) => {
      calls.push({ method: 'listByCustomer', id });
      return [] as OrderSummaryLedgerEntry[];
    },
    listByRestaurant: async (id) => {
      calls.push({ method: 'listByRestaurant', id });
      return [] as OrderSummaryLedgerEntry[];
    },
    listByCourier: async (id) => {
      calls.push({ method: 'listByCourier', id });
      return [] as OrderSummaryLedgerEntry[];
    },
    listAll: async () => {
      calls.push({ method: 'listAll' });
      return [] as OrderSummaryLedgerEntry[];
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

    return await fetch(
      `http://127.0.0.1:${address.port}/api/order-summaries/history`,
      authenticated ? { headers: { Authorization: 'Bearer valid-token' } } : {},
    );
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

  it('uses only the ledger method scoped to the authenticated role', async () => {
  const cases: Array<{
    account: Account;
    expected: HistoryLedgerCall;
  }> = [
    {
      account: new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
      expected: { method: 'listByCustomer', id: '1' },
    },
    {
      account: new RestaurantStaffAccount(2, 'restaurant', 'password', 'restaurant@example.com', 7),
      expected: { method: 'listByRestaurant', id: '1' },
    },
    {
      account: new CourierAccount(3, 'courier', 'password', 'courier@example.com'),
      expected: { method: 'listByCourier', id: '3' },
    },
    {
      account: new OperatorAccount(4, 'operator', 'password', 'operator@example.com'),
      expected: { method: 'listAll' },
    },
  ];

  for (const { account, expected } of cases) {
    const calls: HistoryLedgerCall[] = [];
    const response = await requestHistory(account, calls);

    assert.equal(response.status, 200, `${account.role} should access history`);
    await response.json();
    assert.deepEqual(calls, [expected], `${account.role} should call only its scoped ledger method`);
  }
});

it('returns 401 for unauthenticated ledger history requests', async () => {
  const calls: HistoryLedgerCall[] = [];
  const response = await requestHistory(
    new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
    calls,
    false,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

it('lets an operator refund a delivered order', async () => {
  const order = createOrder(true);
  const refundCalls: RefundCall[] = [];

  const response = await requestRefund(
    new OperatorAccount(4, 'operator', 'password', 'operator@example.com'),
    order,
    refundCalls,
  );
  const body = await response.json() as { orderId: string; status: string };

  assert.equal(response.status, 200);
  assert.deepEqual(body, { orderId: '1', status: 'refunded' });
  assert.equal(order.status, OrderStatus.REFUNDED);
  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0]?.summary.orderId, '1');
});

it('does not allow a non-operator to refund an order', async () => {
  const order = createOrder(true);
  const refundCalls: RefundCall[] = [];

  const response = await requestRefund(
    new CustomerAccount(1, 'customer', 'password', 'customer@example.com'),
    order,
    refundCalls,
  );

  assert.equal(response.status, 403);
  assert.equal(order.status, OrderStatus.DELIVERED);
  assert.equal(refundCalls.length, 0);
});

it('rejects refunding an order that has not been delivered', async () => {
  const order = createOrder(false);
  const refundCalls: RefundCall[] = [];

  const response = await requestRefund(
    new OperatorAccount(4, 'operator', 'password', 'operator@example.com'),
    order,
    refundCalls,
  );

  assert.equal(response.status, 409);
  assert.equal(order.status, OrderStatus.PLACED);
  assert.equal(refundCalls.length, 0);
});

it('requires authentication to refund an order', async () => {
  const order = createOrder(true);
  const refundCalls: RefundCall[] = [];

  const response = await requestRefund(
    new OperatorAccount(4, 'operator', 'password', 'operator@example.com'),
    order,
    refundCalls,
    false,
  );

  assert.equal(response.status, 401);
  assert.equal(order.status, OrderStatus.DELIVERED);
  assert.equal(refundCalls.length, 0);
});
});
