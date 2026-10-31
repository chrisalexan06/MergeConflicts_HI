import { Order } from '../../domain/ORD/Order.js';
import { OrderStatus } from '../../domain/ORD/OrderStatus.js'; 
import { CourierStatus } from '../../domain/DLV/CourierStatus.js'; 
import { ICourierStore } from '../../infrastructure/DLV/ICourierStore.js';

export class DeliveryAssignmentService {
  constructor(private courierStore: ICourierStore) {}

  /**
   * R-DLV-01: Dispatches an order only after restaurant marks it ready.
   * Demo note: Enforces order status is READY before courier binding.
   */
  public async assignReadyOrder(order: Order): Promise<boolean> {
    // R-DLV-01 Guard check using ORD enum
    if (order.status !== OrderStatus.READY && (order.status as string) !== 'ready') {
      console.warn(`[R-DLV-01] Dispatch aborted: Order #${order.id} is '${order.status}', not 'ready'.`);
      return false;
    }

    // Find couriers currently IDLE
    const idleCouriers = await this.courierStore.findIdleCouriers();
    if (!idleCouriers || idleCouriers.length === 0) {
      return false; // Order waits in dispatch queue 
    }

    const selectedCourier = idleCouriers[0];

    // Bind order to courier
    order.assignCourier(selectedCourier.id);

    // Update courier state to ASSIGNED using DLV enum
    selectedCourier.status = CourierStatus.ASSIGNED;
    selectedCourier.currentOrderId = order.id;
    await this.courierStore.save(selectedCourier);

    return true;
  }
}