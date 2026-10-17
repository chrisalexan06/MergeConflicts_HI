import { readFile } from 'node:fs/promises';
import type { CustomerAccount, CourierAccount } from '../../domain/REG/Account.js';
import type { Menu } from '../../domain/ORD/Menu.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import type { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';

export interface InitialCityCustomer {
  id: CustomerAccount['accountID'];
  name: CustomerAccount['accountName'];
  deliveryAddress: {
    latitude: NonNullable<CustomerAccount['latitude']>;
    longitude: NonNullable<CustomerAccount['longitude']>;
  };
}

export interface InitialCityCourier {
  id: CourierAccount['accountID'];
  latitude: number;
  longitude: number;
  status: CourierAccount['courierStatus'];
}

export type InitialCityMenuItem = {
  itemId: number;
  itemName: string;
  price: number;
  status: MenuItemStatus;
};

export type InitialCityRestaurant = Pick<
  Restaurant,
  'restaurantId' | 'restaurantName' | 'status' | 'latitude' | 'longitude'
> & {
  menu: Pick<Menu, 'items'> & { items: InitialCityMenuItem[] };
};

export interface InitialCityConfiguration {
  city: string;
  restaurants: InitialCityRestaurant[];
  couriers: InitialCityCourier[];
  customers: InitialCityCustomer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function assertInitialCityConfiguration(value: unknown): asserts value is InitialCityConfiguration {
  if (!isRecord(value) || typeof value.city !== 'string' || !Array.isArray(value.restaurants)) {
    throw new Error('Initial city configuration must contain a city and a restaurants array.');
  }

  const restaurantIds = new Set<number>();
  const itemIds = new Set<number>();

  for (const [restaurantIndex, restaurant] of value.restaurants.entries()) {
    if (
      !isRecord(restaurant)
      || !isSafeInteger(restaurant.restaurantId)
      || typeof restaurant.restaurantName !== 'string'
      || !(
        restaurant.status === RestaurantStatus.OPEN
        || restaurant.status === RestaurantStatus.PAUSED
        || restaurant.status === RestaurantStatus.CLOSED
      )
      || !isFiniteNumber(restaurant.latitude)
      || restaurant.latitude < -90
      || restaurant.latitude > 90
      || !isFiniteNumber(restaurant.longitude)
      || restaurant.longitude < -180
      || restaurant.longitude > 180
      || !isRecord(restaurant.menu)
      || !Array.isArray(restaurant.menu.items)
    ) {
      throw new Error(`Restaurant at index ${restaurantIndex} is invalid in the initial city configuration.`);
    }

    if (restaurantIds.has(restaurant.restaurantId)) {
      throw new Error(`Duplicate restaurantId ${restaurant.restaurantId} in the initial city configuration.`);
    }
    restaurantIds.add(restaurant.restaurantId);

    for (const [itemIndex, item] of restaurant.menu.items.entries()) {
      if (
        !isRecord(item)
        || !isSafeInteger(item.itemId)
        || typeof item.itemName !== 'string'
        || !isFiniteNumber(item.price)
        || !(
          item.status === MenuItemStatus.AVAILABLE
          || item.status === MenuItemStatus.SOLD_OUT
        )
      ) {
        throw new Error(
          `Menu item at index ${itemIndex} for restaurant ${restaurant.restaurantId} is invalid in the initial city configuration.`
        );
      }

      if (itemIds.has(item.itemId)) {
        throw new Error(`Duplicate itemId ${item.itemId} in the initial city configuration.`);
      }
      itemIds.add(item.itemId);
    }
  }

  if (!Array.isArray(value.couriers) || !Array.isArray(value.customers)) {
    throw new Error('Initial city configuration must contain couriers and customers arrays.');
  }
}

export async function loadInitialCityConfiguration(): Promise<InitialCityConfiguration> {
  const configurationUrl = new URL('../../../config/sugardash.initial-city.json', import.meta.url);
  const configurationText = await readFile(configurationUrl, 'utf8');

  let value: unknown;
  try {
    value = JSON.parse(configurationText);
  } catch (error) {
    throw new Error('Failed to parse the SugarDash initial city configuration.', { cause: error });
  }

  assertInitialCityConfiguration(value);
  return value;
}
