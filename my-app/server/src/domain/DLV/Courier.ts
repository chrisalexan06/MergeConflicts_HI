import { CourierStatus } from './CourierStatus.js';

export class Courier {
  public id: string;
  public name: string;
  public status: CourierStatus;
  public currentOrderId: string | null;

  constructor(
    id: string,
    name: string,
    status: CourierStatus = CourierStatus.OFFLINE,
    currentOrderId: string | null = null
  ) {
    this.id = id;
    this.name = name;
    this.status = status;
    this.currentOrderId = currentOrderId;
    if (
  (status === CourierStatus.OFFLINE ||
   status === CourierStatus.IDLE) &&
  currentOrderId !== null
) {
  throw new Error(
    'An offline or idle courier cannot hold an order.'
  );
}

if (
  (status === CourierStatus.ASSIGNED ||
   status === CourierStatus.CARRYING) &&
  currentOrderId === null
) {
  throw new Error(
    'An assigned or carrying courier must have an order.'
  );
}
  }

  // Helper check for assignment
  public isAvailable(): boolean {
    return this.status === CourierStatus.IDLE && this.currentOrderId === null;
  }

  public goOnDuty(): void {
  if (this.status !== CourierStatus.OFFLINE) {
    throw new Error('Courier is already on duty.');
  }

  this.status = CourierStatus.IDLE;
}

public goOffDuty(): void {
  if (this.status === CourierStatus.CARRYING) {
    throw new Error(
      'R-DLV-03: Cannot go offline while carrying an order.'
    );
  }

  if (this.status === CourierStatus.ASSIGNED ||
      this.currentOrderId !== null) {
    throw new Error(
      'Courier must finish their assigned order before going offline.'
    );
  }

  this.status = CourierStatus.OFFLINE;
}

public acceptOrder(orderId: string): void {
  if (!orderId.trim()) {
    throw new Error('Order ID is required.');
  }

  if (!this.isAvailable()) {
    throw new Error(
      'R-DLV-03: Courier cannot accept another order.'
    );
  }

  this.currentOrderId = orderId;
  this.status = CourierStatus.ASSIGNED;
}

public confirmPickup(orderId: string): void {
  if (this.status !== CourierStatus.ASSIGNED ||
      this.currentOrderId !== orderId) {
    throw new Error(
      'Courier cannot pick up an unassigned order.'
    );
  }

  this.status = CourierStatus.CARRYING;
}

public confirmDelivery(orderId: string): void {
  if (this.status !== CourierStatus.CARRYING ||
      this.currentOrderId !== orderId) {
    throw new Error(
      'Courier cannot deliver an order they are not carrying.'
    );
  }

  this.currentOrderId = null;
  this.status = CourierStatus.IDLE;
}
}