export type CourierStatus = 'offline' | 'idle' | 'assigned' | 'carrying';

export interface CourierView {
  id: string;
  name: string;
  status: CourierStatus;
  currentOrderId?: string | null;
}