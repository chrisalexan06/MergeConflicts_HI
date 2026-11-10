import type { Account } from '../../domain/REG/Account.js';
import { Role } from '../../domain/REG/Role.js';
import type { OrderSummaryLedgerEntry } from '../../infrastructure/PRC/PostgresOrderSummaryLedger.js';

export interface OrderSummaryHistoryLedger {
  listByCustomer(customerId: string): Promise<OrderSummaryLedgerEntry[]>;
  listByRestaurant(restaurantId: string): Promise<OrderSummaryLedgerEntry[]>;
  listByCourier(courierId: string): Promise<OrderSummaryLedgerEntry[]>;
  listAll(): Promise<OrderSummaryLedgerEntry[]>;
}

export interface OrderSummaryHistoryContext {
  ledger: OrderSummaryHistoryLedger;
  findRestaurantId(accountId: string): Promise<string | null>;
}

export interface OrderSummaryHistoryStrategy {
  getHistory(
    account: Account,
    context: OrderSummaryHistoryContext,
  ): Promise<OrderSummaryLedgerEntry[] | null>;
}

class CustomerHistoryStrategy implements OrderSummaryHistoryStrategy {
  getHistory(account: Account, context: OrderSummaryHistoryContext) {
    return context.ledger.listByCustomer(String(account.accountID));
  }
}

class RestaurantHistoryStrategy implements OrderSummaryHistoryStrategy {
  async getHistory(account: Account, context: OrderSummaryHistoryContext) {
    const restaurantId = await context.findRestaurantId(String(account.accountID));
    if (restaurantId === null) {
      return null;
    }
    return context.ledger.listByRestaurant(restaurantId);
  }
}

class CourierHistoryStrategy implements OrderSummaryHistoryStrategy {
  getHistory(account: Account, context: OrderSummaryHistoryContext) {
    return context.ledger.listByCourier(String(account.accountID));
  }
}

class OperatorHistoryStrategy implements OrderSummaryHistoryStrategy {
  getHistory(_account: Account, context: OrderSummaryHistoryContext) {
    return context.ledger.listAll();
  }
}

export function createOrderSummaryHistoryStrategies():
  Record<Role, OrderSummaryHistoryStrategy> {
  return {
    [Role.CUSTOMER]: new CustomerHistoryStrategy(),
    [Role.RESTAURANT]: new RestaurantHistoryStrategy(),
    [Role.COURIER]: new CourierHistoryStrategy(),
    [Role.OPERATOR]: new OperatorHistoryStrategy(),
  };
}