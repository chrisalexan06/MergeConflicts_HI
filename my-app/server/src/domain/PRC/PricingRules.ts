import type { PricingConfig, PricingContext, PricingRule } from './PricingRule.js';
import { round2 } from './PricingRule.js';

export class DeliveryFeeRule implements PricingRule {
  readonly name = 'deliveryFee';

  constructor(private readonly config: PricingConfig) {}

  apply(_ctx: PricingContext): number {
    return this.config.deliveryFee;
  }
}

export class ServiceFeeRule implements PricingRule {
  readonly name = 'serviceFee';

  constructor(private readonly config: PricingConfig) {}

  apply(ctx: PricingContext): number {
    return round2(ctx.subtotal * this.config.serviceFeeRate);
  }
}

export class SmallOrderSurchargeRule implements PricingRule {
  readonly name = 'smallOrderSurcharge';

  constructor(private readonly config: PricingConfig) {}

  apply(ctx: PricingContext): number {
    return ctx.subtotal < this.config.smallOrderThreshold
      ? this.config.smallOrderSurcharge
      : 0;
  }
}
