import { Courier } from '../../domain/DLV/Courier.js';

export interface CourierLocation {
  id: string;
  latitude: number;
  longitude: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ICourierStore {
  /**
   * Finds all couriers who are on duty and not currently delivering an order.
   */
  findIdleCouriers(): Promise<Courier[]>;

  /**
   * Finds courier by their unique ID.
   */
  findById(courierId: string): Promise<Courier | null>;

  /**
   * Persists changes to a courier's state (status, assigned order ID).
   */
  save(courier: Courier): Promise<void>;
  assignOrder(
  courierId: string,
  orderId: string
): Promise<Courier>;

findAvailableCouriers(): Promise<CourierLocation[]>;

findRestaurantPosition(
  restaurantId: string
): Promise<Coordinates>;

reassignOrder(
  orderId: string,
  newCourierId: string
): Promise<void>;

}