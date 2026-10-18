import { OrderLine } from './OrderLine.js';
import { OrderStatus } from './OrderStatus.js';

export interface NewOrder {
  id: string;
  customerId: string;
  restaurantId: string;
  lines: OrderLine[];
  createdAt: Date;
  updatedAt?: Date;
}

export class Order {
  readonly id: string;
  readonly customerId: string;
  readonly restaurantId: string;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly createdAt: Date;
  private currentStatus: OrderStatus;
  private lastUpdatedAt: Date;

  constructor(order: NewOrder, status = OrderStatus.PLACED) {
    if (!order.id.trim() || !order.customerId.trim() || !order.restaurantId.trim()) {
      throw new Error('An order must have an id, customer, and restaurant.');
    }
    if (order.lines.length === 0) {
      throw new Error('An order must contain at least one line.');
    }

    this.id = order.id;
    this.customerId = order.customerId;
    this.restaurantId = order.restaurantId;
    this.lines = [...order.lines];
    this.createdAt = order.createdAt;
    this.lastUpdatedAt = order.updatedAt ?? order.createdAt;
    this.currentStatus = status;
  }

  get status(): OrderStatus {
    return this.currentStatus;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  get total(): number {
    return this.lines.reduce((sum, line) => sum + line.subtotal, 0);
  }

  cancel(): void {
    this.transition(OrderStatus.PLACED, OrderStatus.CANCELLED);
  }

  cancelByRestaurant(): void {
    this.transition(
      [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
      OrderStatus.CANCELLED,
    );
  }

  accept(): void {
    this.transition(OrderStatus.PLACED, OrderStatus.ACCEPTED);
  }

  startPreparing(): void {
    this.transition(OrderStatus.ACCEPTED, OrderStatus.PREPARING);
  }

  markReady(): void {
    this.transition(OrderStatus.PREPARING, OrderStatus.READY);
  }

  private transition(expected: OrderStatus | OrderStatus[], next: OrderStatus): void {
    const allowedStatuses = Array.isArray(expected) ? expected : [expected];
    if (!allowedStatuses.includes(this.currentStatus)) {
      throw new Error(`Cannot change order status from ${this.currentStatus} to ${next}.`);
    }
    this.currentStatus = next;
    this.lastUpdatedAt = new Date();
  }
}
