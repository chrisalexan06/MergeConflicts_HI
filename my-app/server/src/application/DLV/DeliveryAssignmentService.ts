import { Order } from '../../domain/ORD/Order.js';
import { OrderStatus } from '../../domain/ORD/OrderStatus.js'; 
import { CourierStatus } from '../../domain/DLV/CourierStatus.js'; 
import { ICourierStore } from '../../infrastructure/DLV/ICourierStore.js';
import {
  selectNearestCourier
} from './CourierSelection.js';

export class DeliveryAssignmentService {
  constructor(private courierStore: ICourierStore) {}

  /**
   * Dispatches an order only after restaurant marks it ready.
   
   */
  public async assignReadyOrder(order: Order): Promise<boolean> {
    //Guard check using ORD enum
    if (order.status !== OrderStatus.READY && (order.status as string) !== 'ready') {
      console.warn(`[R-DLV-01] Dispatch aborted: Order #${order.id} is '${order.status}', not 'ready'.`);
      return false;
    }

    
const restaurant =
  await this.courierStore.findRestaurantPosition(
    order.restaurantId
  );

const availableCouriers =
  await this.courierStore.findAvailableCouriers();

const selectedCourier = selectNearestCourier(
  restaurant,
  availableCouriers
);

if (!selectedCourier) {
  return false;
}

await this.courierStore.assignOrder(
  selectedCourier.id,
  order.id
);

order.assignCourier(selectedCourier.id);

return true;

  }
}