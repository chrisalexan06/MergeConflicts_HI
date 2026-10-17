import { OrderLine } from './OrderLine.js';
import { OrderStatus } from './OrderStatus.js';

export class Order {
  public readonly orderId: number;
  public readonly customerId: number;
  public readonly restaurantId: number;
  public orderLines: OrderLine[];
  public status: OrderStatus;

  constructor(
    orderId: number,
    customerId: number,
    restaurantId: number,
    orderLines: OrderLine[],
    status: OrderStatus
  ) {
    this.orderId = orderId;
    this.customerId = customerId;
    this.restaurantId = restaurantId;
    this.orderLines = orderLines;
    this.status = status;
  }
}
