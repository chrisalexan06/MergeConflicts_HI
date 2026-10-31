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

export interface OrderStatusChange {
  orderId: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  occurredAt: Date;
}

export interface OrderObserver {
  onStatusChanged(change: OrderStatusChange): void;
}

export class Order {
  readonly id: string;
  readonly customerId: string;
  readonly restaurantId: string;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly createdAt: Date;
  private currentStatus: OrderStatus;
  private lastUpdatedAt: Date;
  private readonly statusChanges: OrderStatusChange[] = [];
  private readonly observers = new Set<OrderObserver>();
  public courierId?: string | null;

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
    this.courierId = null;
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

  get transitionEvents(): ReadonlyArray<OrderStatusChange> {
    return this.statusChanges.map((change) => ({
      ...change,
      occurredAt: new Date(change.occurredAt),
    }));
  }

  subscribe(observer: OrderObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
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
  
  public canBeAssigned(): boolean {
    return this.status === OrderStatus.READY || (this.status as string) === 'ready';
  }
  public assignCourier(courierId: string): void {
    if (!this.canBeAssigned()) {
      throw new Error(
        `[R-DLV-01 Violation] Impossible d'assigner la commande #${this.id}. ` +
        `Son statut est '${this.status}', mais doit être 'ready'.`
      );
    }

    this.courierId = courierId;
  }

  
public confirmPickup(courierId: string): void {
  if (this.courierId !== courierId) {
    throw new Error(
      'Only the assigned courier can confirm pickup.'
    );
  }

  this.transition(
    OrderStatus.READY,
    OrderStatus.PICKED_UP
  );
}

public confirmDelivery(courierId: string): void {
  if (this.courierId !== courierId) {
    throw new Error(
      'Only the assigned courier can confirm delivery.'
    );
  }

  this.transition(
    OrderStatus.PICKED_UP,
    OrderStatus.DELIVERED
  );
}

  private transition(expected: OrderStatus | OrderStatus[], next: OrderStatus): void {
    const allowedStatuses = Array.isArray(expected) ? expected : [expected];
    if (!allowedStatuses.includes(this.currentStatus)) {
      throw new Error(`Cannot change order status from ${this.currentStatus} to ${next}.`);
    }
    const previousStatus = this.currentStatus;
    const occurredAt = new Date();
    this.currentStatus = next;
    this.lastUpdatedAt = occurredAt;

    const change: OrderStatusChange = Object.freeze({
      orderId: this.id,
      previousStatus,
      status: next,
      occurredAt,
    });
    this.statusChanges.push(change);
    for (const observer of this.observers) {
      observer.onStatusChanged({
        ...change,
        occurredAt: new Date(change.occurredAt),
      });
    }
  }
}
