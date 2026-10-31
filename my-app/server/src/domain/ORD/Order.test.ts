import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Order } from './Order.js';
import { OrderLine } from './OrderLine.js';
import { OrderStatus } from './OrderStatus.js';

function createOrder(): Order {
  return new Order({
    id: 'order-1',
    customerId: 'customer-1',
    restaurantId: 'restaurant-1',
    lines: [new OrderLine('item-1', 'Cake', 4.5, 2)],
    createdAt: new Date('2026-10-15T12:00:00Z'),
  });
}

describe('Order domain', () => {
  it('starts placed, calculates line totals, and advances through ready', () => {
    const order = createOrder();
    let previousUpdatedAt = order.updatedAt;

    assert.equal(order.status, OrderStatus.PLACED);
    assert.equal(order.total, 9);
    order.accept();
    assert.equal(order.status, OrderStatus.ACCEPTED);
    assert.ok(order.updatedAt.getTime() >= previousUpdatedAt.getTime());
    previousUpdatedAt = order.updatedAt;
    order.startPreparing();
    assert.equal(order.status, OrderStatus.PREPARING);
    assert.ok(order.updatedAt.getTime() >= previousUpdatedAt.getTime());
    previousUpdatedAt = order.updatedAt;
    order.markReady();
    assert.equal(order.status, OrderStatus.READY);
    assert.ok(order.updatedAt.getTime() >= previousUpdatedAt.getTime());
  });

  it('notifies observers with a timestamped event for each valid transition', () => {
    const order = createOrder();
    const changes: Array<{
      orderId: string;
      previousStatus: OrderStatus;
      status: OrderStatus;
      occurredAt: Date;
    }> = [];
    const unsubscribe = order.subscribe({
      onStatusChanged: (change) => changes.push(change),
    });

    order.accept();
    order.startPreparing();
    order.markReady();
    unsubscribe();

    assert.deepEqual(
      changes.map(({ previousStatus, status }) => [previousStatus, status]),
      [
        [OrderStatus.PLACED, OrderStatus.ACCEPTED],
        [OrderStatus.ACCEPTED, OrderStatus.PREPARING],
        [OrderStatus.PREPARING, OrderStatus.READY],
      ],
    );
    assert.ok(changes.every((change) => change.orderId === order.id && change.occurredAt instanceof Date));
    assert.deepEqual(
      order.transitionEvents.map(({ previousStatus, status }) => [previousStatus, status]),
      [
        [OrderStatus.PLACED, OrderStatus.ACCEPTED],
        [OrderStatus.ACCEPTED, OrderStatus.PREPARING],
        [OrderStatus.PREPARING, OrderStatus.READY],
      ],
    );
  });

  it('rejects invalid quantities and illegal transitions', () => {
    assert.throws(() => new OrderLine('item-1', 'Cake', 4.5, 0), /positive integer/);
    const order = createOrder();
    assert.throws(() => order.markReady(), /Cannot change order status/);
    assert.equal(order.transitionEvents.length, 0);
  });

  it('allows cancellation only before restaurant acceptance', () => {
    const order = createOrder();
    order.cancel();
    assert.equal(order.status, OrderStatus.CANCELLED);
    assert.throws(() => order.cancel(), /Cannot change order status/);

    const acceptedOrder = createOrder();
    acceptedOrder.accept();
    assert.throws(() => acceptedOrder.cancel(), /Cannot change order status/);

    const preparingOrder = createOrder();
    preparingOrder.accept();
    preparingOrder.startPreparing();
    assert.throws(() => preparingOrder.cancel(), /Cannot change order status/);

    const readyOrder = createOrder();
    readyOrder.accept();
    readyOrder.startPreparing();
    readyOrder.markReady();
    assert.throws(() => readyOrder.cancel(), /Cannot change order status/);
  });

  it('allows restaurant cancellation before ready but not after ready', () => {
    const acceptedOrder = createOrder();
    acceptedOrder.accept();
    acceptedOrder.cancelByRestaurant();
    assert.equal(acceptedOrder.status, OrderStatus.CANCELLED);

    const preparingOrder = createOrder();
    preparingOrder.accept();
    preparingOrder.startPreparing();
    preparingOrder.cancelByRestaurant();
    assert.equal(preparingOrder.status, OrderStatus.CANCELLED);

    const readyOrder = createOrder();
    readyOrder.accept();
    readyOrder.startPreparing();
    readyOrder.markReady();
    assert.throws(() => readyOrder.cancelByRestaurant(), /Cannot change order status/);
  });

  // =========================================================================
  // R-DLV-01: DLV shall assign an order only after restaurant marks it ready
  // =========================================================================
  it('R-DLV-01: prevents assigning a courier when order is PLACED', () => {
    const order = createOrder();
    assert.equal(order.status, OrderStatus.PLACED);
    assert.equal(order.canBeAssigned(), false);
    assert.throws(() => order.assignCourier('courier-1'), /R-DLV-01 Violation/);
    assert.equal(order.courierId, null);
  });

  it('R-DLV-01: prevents assigning a courier when order is PREPARING', () => {
    const order = createOrder();
    order.accept();
    order.startPreparing();
    assert.equal(order.status, OrderStatus.PREPARING);
    assert.equal(order.canBeAssigned(), false);
    assert.throws(() => order.assignCourier('courier-1'), /R-DLV-01 Violation/);
    assert.equal(order.courierId, null);
  });

  it('R-DLV-01: successfully assigns a courier when order is READY', () => {
    const order = createOrder();
    order.accept();
    order.startPreparing();
    order.markReady();
    assert.equal(order.status, OrderStatus.READY);
    assert.equal(order.canBeAssigned(), true);
    assert.doesNotThrow(() => order.assignCourier('courier-1'));
    assert.equal(order.courierId, 'courier-1');
  });
});