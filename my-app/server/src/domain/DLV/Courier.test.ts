
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Courier } from './Courier.js';
import { CourierStatus } from './CourierStatus.js';

describe('R-DLV-03 Courier restrictions', () => {

  it('allows an offline courier to go on duty', () => {
    const courier = new Courier('1', 'Sarah');

    courier.goOnDuty();

    assert.equal(courier.status, CourierStatus.IDLE);
    assert.equal(courier.isAvailable(), true);
  });

  it('prevents a courier from holding two orders', () => {
    const courier = new Courier(
      '1', 'Sarah', CourierStatus.IDLE
    );

    courier.acceptOrder('order-1');

    assert.throws(
      () => courier.acceptOrder('order-2'),
      /cannot accept another order/
    );

    assert.equal(courier.currentOrderId, 'order-1');
  });

  it('prevents going offline while carrying', () => {
    const courier = new Courier(
      '1', 'Sarah', CourierStatus.IDLE
    );

    courier.acceptOrder('order-1');
    courier.confirmPickup('order-1');

    assert.throws(
      () => courier.goOffDuty(),
      /Cannot go offline while carrying/
    );

    assert.equal(courier.status, CourierStatus.CARRYING);
  });

  it('rejects pickup of a different order', () => {
    const courier = new Courier(
      '1', 'Sarah', CourierStatus.IDLE
    );

    courier.acceptOrder('order-1');

    assert.throws(
      () => courier.confirmPickup('order-2'),
      /cannot pick up an unassigned order/
    );
  });

  it('returns courier to idle after delivery', () => {
    const courier = new Courier(
      '1', 'Sarah', CourierStatus.IDLE
    );

    courier.acceptOrder('order-1');
    courier.confirmPickup('order-1');
    courier.confirmDelivery('order-1');

    assert.equal(courier.status, CourierStatus.IDLE);
    assert.equal(courier.currentOrderId, null);
    assert.equal(courier.isAvailable(), true);
  });

  it('allows going offline after delivery', () => {
    const courier = new Courier(
      '1', 'Sarah', CourierStatus.IDLE
    );

    courier.acceptOrder('order-1');
    courier.confirmPickup('order-1');
    courier.confirmDelivery('order-1');
    courier.goOffDuty();

    assert.equal(courier.status, CourierStatus.OFFLINE);
  });
});
