import type { OrderLine } from '../ORD/OrderLine.js';
import type { PricingRule } from './PricingRule.js';
import { round2 } from './PricingRule.js';

export interface FareBreakdownLine {
  readonly name: string;
  readonly amount: number;
}

export interface Fare {
  readonly subtotal: number;
  readonly breakdown: ReadonlyArray<FareBreakdownLine>;
  readonly total: number;
}

export class FareCalculator {
  constructor(private readonly rules: ReadonlyArray<PricingRule>) {}

  calculate(lines: ReadonlyArray<OrderLine>): Fare {
    const subtotal = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
    if (!Number.isFinite(subtotal)) {
      throw new Error('Order subtotal must be finite.');
    }

    const context = { lines, subtotal };
    const breakdown = this.rules.map((rule) => {
      const amount = rule.apply(context);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Pricing rule "${rule.name}" returned an invalid amount.`);
      }
      return { name: rule.name, amount };
    });
    const total = round2(
      subtotal + breakdown.reduce((sum, item) => sum + item.amount, 0),
    );
    if (!Number.isFinite(total)) {
      throw new Error('Order total must be finite.');
    }

    return { subtotal, breakdown, total };
  }
}
