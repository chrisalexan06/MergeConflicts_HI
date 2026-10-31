import { Courier } from '../../domain/DLV/Courier.js';

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
}