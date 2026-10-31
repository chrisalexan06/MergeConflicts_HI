import { Courier } from '../domain/DLV/Courier.js';
import { PostgresCourierStore } from '../infrastructure/DLV/PostgresCourierStore.js';


export class CourierService {
  constructor(
    private readonly store: PostgresCourierStore
  ) {}

  async getCourier(courierId: string): Promise<Courier> {
    const courier = await this.store.findById(courierId);

    if (!courier) {
      throw new Error('Courier not found.');
    }

    return courier;
  }

  async goOnDuty(courierId: string): Promise<Courier> {
    return this.store.changeDuty(courierId, true);
  }

  async goOffDuty(courierId: string): Promise<Courier> {
    return this.store.changeDuty(courierId, false);
  }

  async confirmPickup(
    courierId: string,
    orderId: string
  ): Promise<Courier> {
    return this.store.pickup(courierId, orderId);
  }

  async confirmDelivery(
    courierId: string,
    orderId: string
  ): Promise<Courier> {
    return this.store.deliver(courierId, orderId);
  }
}