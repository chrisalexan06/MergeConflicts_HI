
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectNearestCourier
} from './CourierSelection.js';

describe('R-DLV-02 Courier selection', () => {
  const restaurant = {
    latitude: 45,
    longitude: -73
  };

  it('selects the nearest courier', () => {
    const selected = selectNearestCourier(
      restaurant,
      [
        { id: '9', latitude: 47, longitude: -73 },
        { id: '14', latitude: 45.5, longitude: -73 },
        { id: '7', latitude: 46, longitude: -73 }
      ]
    );

    assert.equal(selected?.id, '14');
  });

  it('breaks distance ties using lowest numeric ID', () => {
    const selected = selectNearestCourier(
      restaurant,
      [
        { id: '10', latitude: 46, longitude: -73 },
        { id: '9', latitude: 44, longitude: -73 }
      ]
    );

    assert.equal(selected?.id, '9');
  });

  it('returns null if no couriers are available', () => {
    const selected = selectNearestCourier(
      restaurant,
      []
    );

    assert.equal(selected, null);
  });

  it('does not modify the courier list', () => {
    const couriers = [
      { id: '9', latitude: 47, longitude: -73 },
      { id: '7', latitude: 45, longitude: -73 }
    ];

    selectNearestCourier(restaurant, couriers);

    assert.equal(couriers[0].id, '9');
  });
});
