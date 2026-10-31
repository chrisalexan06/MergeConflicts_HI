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
  }

  // Helper check for assignment
  public isAvailable(): boolean {
    return this.status === CourierStatus.IDLE && this.currentOrderId === null;
  }
}