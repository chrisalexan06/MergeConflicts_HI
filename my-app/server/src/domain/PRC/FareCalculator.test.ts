import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadInitialCityConfiguration } from '../../application/ORD/InitialCityConfiguration.js';
import { OrderLine } from '../ORD/OrderLine.js';
import { FareCalculator } from './FareCalculator.js';
import type { PricingConfig, PricingRule } from './PricingRule.js';
import {
  DeliveryFeeRule,
  ServiceFeeRule,
  SmallOrderSurchargeRule,
} from './PricingRules.js';

function createCalculator(config: PricingConfig): FareCalculator {
  return new FareCalculator([
    new DeliveryFeeRule(config),
    new ServiceFeeRule(config),
    new SmallOrderSurchargeRule(config),
  ]);
}

function surchargeFor(calculator: FareCalculator, lines: OrderLine[]): number {
  const surcharge = calculator.calculate(lines).breakdown
    .find((item) => item.name === 'smallOrderSurcharge');
  assert.ok(surcharge);
  return surcharge.amount;
}

const defaultConfig: PricingConfig = {
  deliveryFee: 3.99,
  serviceFeeRate: 0.10,
  smallOrderThreshold: 15.00,
  smallOrderSurcharge: 2.00,
};

describe('FareCalculator', () => {
  it('calculates the subtotal and fees from order-line price snapshots', () => {
    const fare = createCalculator(defaultConfig).calculate([
      new OrderLine('cake', 'Cake', 8.00, 2),
      new OrderLine('tart', 'Tart', 4.50, 1),
    ]);

    assert.deepEqual(fare, {
      subtotal: 20.50,
      breakdown: [
        { name: 'deliveryFee', amount: 3.99 },
        { name: 'serviceFee', amount: 2.05 },
        { name: 'smallOrderSurcharge', amount: 0 },
      ],
      total: 26.54,
    });
  });

  it('charges only when the rounded food subtotal is strictly below threshold', () => {
    const calculator = createCalculator(defaultConfig);
    assert.equal(surchargeFor(calculator, [new OrderLine('item', 'Item', 14.99, 1)]), 2);
    assert.equal(surchargeFor(calculator, [new OrderLine('item', 'Item', 15.00, 1)]), 0);
    assert.equal(surchargeFor(calculator, [new OrderLine('item', 'Item', 15.01, 1)]), 0);
  });

  it('rounds awkward subtotals before comparing them with the threshold', () => {
    const calculator = createCalculator(defaultConfig);
    const lines = [
      new OrderLine('item', 'Item', 4.99, 3),
      new OrderLine('small-a', 'Small A', 0.1, 1),
      new OrderLine('small-b', 'Small B', 0.2, 1),
    ];
    const fare = calculator.calculate(lines);

    assert.equal(fare.subtotal, 15.27);
    assert.equal(surchargeFor(calculator, lines), 0);

    const exactThresholdLines = [
      new OrderLine('small', 'Small', 0.01, 1),
      new OrderLine('medium', 'Medium', 13.04, 1),
      new OrderLine('large', 'Large', 1.95, 1),
    ];
    assert.equal(
      exactThresholdLines.reduce((sum, line) => sum + line.subtotal, 0),
      14.999999999999998,
    );
    assert.equal(calculator.calculate(exactThresholdLines).subtotal, 15);
    assert.equal(surchargeFor(calculator, exactThresholdLines), 0);
  });

  it('calculates an empty order and returns identical results for identical input', () => {
    const calculator = createCalculator(defaultConfig);
    const emptyFare = {
      subtotal: 0,
      breakdown: [
        { name: 'deliveryFee', amount: 3.99 },
        { name: 'serviceFee', amount: 0 },
        { name: 'smallOrderSurcharge', amount: 2 },
      ],
      total: 5.99,
    };
    assert.deepEqual(calculator.calculate([]), emptyFare);

    const lines = [new OrderLine('item', 'Item', 8, 2)];
    assert.deepEqual(calculator.calculate(lines), calculator.calculate(lines));
  });

  it('rounds a half-cent service fee up to the nearest cent', () => {
    const config = { ...defaultConfig, serviceFeeRate: 0.10 };
    const fare = createCalculator(config).calculate([
      new OrderLine('item', 'Item', 0.05, 1),
    ]);

    assert.equal(fare.breakdown.find((item) => item.name === 'serviceFee')?.amount, 0.01);
  });

  it('loads pricing settings from configuration and changes when config changes', async () => {
    const { pricing } = await loadInitialCityConfiguration();
    assert.deepEqual(pricing, defaultConfig);

    const lines = [new OrderLine('item', 'Item', 20, 1)];
    const original = createCalculator(pricing).calculate(lines);
    const changed = createCalculator({
      deliveryFee: 1.25,
      serviceFeeRate: 0.05,
      smallOrderThreshold: 25,
      smallOrderSurcharge: 0.75,
    }).calculate(lines);

    assert.notDeepEqual(changed, original);
    assert.deepEqual(changed, {
      subtotal: 20,
      breakdown: [
        { name: 'deliveryFee', amount: 1.25 },
        { name: 'serviceFee', amount: 1 },
        { name: 'smallOrderSurcharge', amount: 0.75 },
      ],
      total: 23,
    });
  });

  it('accepts additional strategies without changing FareCalculator', () => {
    const additionalRule: PricingRule = {
      name: 'testRule',
      apply: ({ subtotal }) => subtotal > 0 ? 1 : 0,
    };
    const calculator = new FareCalculator([additionalRule]);

    assert.equal(calculator.calculate([new OrderLine('item', 'Item', 2, 1)]).total, 3);
  });
});
