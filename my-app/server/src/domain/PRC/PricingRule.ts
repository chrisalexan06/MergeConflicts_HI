import type { OrderLine } from '../ORD/OrderLine.js';

export interface PricingContext {
  readonly lines: ReadonlyArray<OrderLine>;
  readonly subtotal: number;
}

export interface PricingRule {
  readonly name: string;
  apply(ctx: PricingContext): number;
}

export interface PricingConfig {
  readonly deliveryFee: number;
  readonly serviceFeeRate: number;
  readonly smallOrderThreshold: number;
  readonly smallOrderSurcharge: number;
}

// For non-negative monetary values, rounds to the nearest cent, with half cents up.
export const round2 = (n: number): number => Math.round(n * 100) / 100;
