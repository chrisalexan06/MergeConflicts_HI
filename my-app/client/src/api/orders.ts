export type OrderStatus =
  | "received"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export interface OrderItem {
  orderLineId: number;
  itemId: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  orderId: number;
  orderStatus: OrderStatus;
  createdAt: string;
  customerId: number;
  items: OrderItem[];
  assignedCourierId: number | null;
}