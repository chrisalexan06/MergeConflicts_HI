import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Order } from '../ORD/Order.js';
import { OrderLine } from '../ORD/OrderLine.js';
import { OrderStatus } from '../ORD/OrderStatus.js';
import { loadInitialCityConfiguration } from '../../application/ORD/InitialCityConfiguration.js';
import { FareCalculator, type Fare } from './FareCalculator.js';
import {
  DeliveryFeeRule,
  ServiceFeeRule,
  SmallOrderSurchargeRule,
} from './PricingRules.js';
import { OrderSummaryService } from './OrderSummary.js';

class SpyFareCalculator extends FareCalculator {
  calls = 0;

  override calculate(lines: ReadonlyArray<OrderLine>): Fare {
    this.calls += 1;
    return super.calculate(lines);
  }
}

function createOrder(lines: OrderLine[] = [
  new OrderLine('item-1', 'Cake', 8, 2),
  new OrderLine('item-2', 'Tea', 4.5, 1),
]): Order {
  return new Order({
    id: 'order-1',
    customerId: 'customer-1',
    restaurantId: 'restaurant-1',
    lines,
    createdAt: new Date('2026-10-15T12:00:00.000Z'),
  });
}

function deliver(order: Order): Order {
  order.accept();
  order.startPreparing();
  order.markReady();
  order.assignCourier('courier-1');
  order.confirmPickup('courier-1');
  order.confirmDelivery('courier-1');
  return order;
}

async function createService(): Promise<{
  service: OrderSummaryService;
  spy: SpyFareCalculator;
}> {
  const { pricing } = await loadInitialCityConfiguration();
  const spy = new SpyFareCalculator([
    new DeliveryFeeRule(pricing),
    new ServiceFeeRule(pricing),
    new SmallOrderSurchargeRule(pricing),
  ]);
  return {
    service: new OrderSummaryService(spy),
    spy,
  };
}

describe('OrderSummaryService', () => {
  it('uses the configured fare rules for a delivered order', async () => {
    const { service } = await createService();
    const order = deliver(createOrder());
    const summary = service.summarize(order);

    assert.equal(summary.subtotal, 20.5);
    assert.deepEqual(
      Object.fromEntries(summary.breakdown.map(({ name, amount }) => [name, amount])),
      { deliveryFee: 3.99, serviceFee: 2.05, smallOrderSurcharge: 0 },
    );
    assert.equal(summary.total, 26.54);
  });

  it('includes the configured small-order surcharge in the breakdown', async () => {
    const { pricing } = await loadInitialCityConfiguration();
    const { service } = await createService();
    const summary = service.summarize(deliver(createOrder([
      new OrderLine('item-1', 'Cake', 4.5, 1),
    ])));

    assert.equal(
      summary.breakdown.find(({ name }) => name === 'smallOrderSurcharge')?.amount,
      pricing.smallOrderSurcharge,
    );
  });

  it('includes order, restaurant, line, courier, and lifecycle details', async () => {
    const { service } = await createService();
    const order = deliver(createOrder());
    const summary = service.summarize(order);

    assert.equal(summary.orderId, order.id);
    assert.equal(summary.restaurantId, order.restaurantId);
    assert.equal(summary.courierId, 'courier-1');
    assert.equal(summary.placedAt, order.createdAt.toISOString());
    assert.equal(summary.deliveredAt, order.updatedAt.toISOString());
    assert.deepEqual(summary.lines.map(({ itemId, quantity, unitPrice }) => ({
      itemId,
      quantity,
      unitPrice,
    })), [
      { itemId: 'item-1', quantity: 2, unitPrice: 8 },
      { itemId: 'item-2', quantity: 1, unitPrice: 4.5 },
    ]);
  });

  it('rejects undelivered orders and has no summary before delivery', async () => {
    const { service } = await createService();
    const order = createOrder();

    assert.equal(service.getSummary(order.id), undefined);
    assert.throws(() => service.summarize(order), /only after delivery/);
    assert.equal(service.getSummary(order.id), undefined);
  });

  it('returns the cached frozen summary without recalculating', async () => {
    const { service, spy } = await createService();
    const order = deliver(createOrder());
    const first = service.summarize(order);
    const second = service.summarize(order);

    assert.strictEqual(second, first);
    assert.equal(spy.calls, 1);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.lines));
    assert.ok(Object.isFrozen(first.lines[0]));
    assert.ok(Object.isFrozen(first.breakdown));
    assert.ok(Object.isFrozen(first.breakdown[0]));
  });

  it('clears cached summaries on reset', async () => {
    const { service, spy } = await createService();
    const order = deliver(createOrder());
    service.summarize(order);

    service.reset();

    assert.equal(service.getSummary(order.id), undefined);
    service.summarize(order);
    assert.equal(spy.calls, 2);
  });
});
