export type CourierStatus = 'offline' | 'idle' | 'assigned' | 'carrying';
export type CourierOrderStatus =
  | 'placed'
  | 'accepted'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface CourierView {
  id: string;
  name: string;
  status: CourierStatus;
  currentOrderId?: string | null;
  currentOrderStatus?: CourierOrderStatus | null;
}

export interface CurrentCourier {
  id: string;
  status: CourierStatus;
  currentOrderId: string | null;
  currentOrderStatus: CourierOrderStatus | null;
  currentOfferId: string | null;
  currentOfferStatus: CourierOrderStatus | null;
}

export interface CourierActionResult {
  status: CourierStatus;
  currentOrderId: string | null;
}