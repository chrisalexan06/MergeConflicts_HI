import { Order } from '../ORD/Order.js';
import { OrderStatus } from '../ORD/OrderStatus.js';
import { round2 } from './PricingRule.js';
import { FareCalculator, type FareBreakdownLine } from './FareCalculator.js';

export interface OrderSummaryLine {
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineSubtotal: number;
}

export interface OrderSummary {
  readonly orderId: string;
  readonly restaurantId: string;
  readonly lines: ReadonlyArray<OrderSummaryLine>;
  readonly courierId: string | null;
  readonly placedAt: string;
  readonly deliveredAt: string;
  readonly subtotal: number;
  readonly breakdown: ReadonlyArray<FareBreakdownLine>;
  readonly total: number;
}

export class OrderSummaryService {
  private readonly summaries = new Map<string, OrderSummary>();

  constructor(private readonly calculator: FareCalculator) {}

  summarize(order: Order, courierId: string | null = order.courierId ?? null): OrderSummary {
    const existing = this.summaries.get(order.id);
    if (existing) {
      return existing;
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new Error('An order summary is available only after delivery.');
    }

    const fare = this.calculator.calculate(order.lines);
    const lines = Object.freeze(order.lines.map((line) => Object.freeze({
      itemId: line.itemId,
      itemName: line.itemName,
      quantity: line.quantity,
      unitPrice: round2(line.unitPrice),
      lineSubtotal: round2(line.subtotal),
    })));
    const breakdown = Object.freeze(fare.breakdown.map((item) => Object.freeze({
      name: item.name,
      amount: round2(item.amount),
    })));
    const summary: OrderSummary = Object.freeze({
      orderId: order.id,
      restaurantId: order.restaurantId,
      lines,
      courierId,
      placedAt: order.createdAt.toISOString(),
      deliveredAt: order.updatedAt.toISOString(),
      subtotal: round2(fare.subtotal),
      breakdown,
      total: round2(fare.total),
    });

    this.summaries.set(order.id, summary);
    // R-PRC-03 ledger call belongs here.
    return summary;
  }

  getSummary(orderId: string): OrderSummary | undefined {
    return this.summaries.get(orderId);
  }

  reset(): void {
    this.summaries.clear();
  }
}
