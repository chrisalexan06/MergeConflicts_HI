import { readFile } from 'node:fs/promises';
import type { InitialCityConfiguration } from './InitialCityConfiguration.js';
import { Menu } from '../../domain/ORD/Menu.js';
import { MenuItem } from '../../domain/ORD/MenuItem.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertInitialCityConfiguration(value: unknown): asserts value is InitialCityConfiguration {
  if (!isRecord(value) || typeof value.city !== 'string' || !Array.isArray(value.restaurants)) {
    throw new Error('Initial city configuration must contain a city and a restaurants array.');
  }

  for (const [restaurantIndex, restaurant] of value.restaurants.entries()) {
    if (
      !isRecord(restaurant)
      || !isNumber(restaurant.restaurantId)
      || typeof restaurant.restaurantName !== 'string'
      || !(
        restaurant.status === RestaurantStatus.OPEN
        || restaurant.status === RestaurantStatus.PAUSED
        || restaurant.status === RestaurantStatus.CLOSED
      )
      || !isNumber(restaurant.latitude)
      || !isNumber(restaurant.longitude)
      || !isRecord(restaurant.menu)
      || !Array.isArray(restaurant.menu.items)
    ) {
      throw new Error(`Restaurant at index ${restaurantIndex} is invalid in the initial city configuration.`);
    }

    for (const [itemIndex, item] of restaurant.menu.items.entries()) {
      if (
        !isRecord(item)
        || !isNumber(item.itemId)
        || typeof item.itemName !== 'string'
        || !isNumber(item.price)
        || !(
          item.status === MenuItemStatus.AVAILABLE
          || item.status === MenuItemStatus.SOLD_OUT
        )
      ) {
        throw new Error(
          `Menu item at index ${itemIndex} for restaurant ${restaurant.restaurantId} is invalid in the initial city configuration.`
        );
      }
    }
  }

  if (!Array.isArray(value.couriers) || !Array.isArray(value.customers)) {
    throw new Error('Initial city configuration must contain couriers and customers arrays.');
  }

  for (const [courierIndex, courier] of value.couriers.entries()) {
    if (
      !isRecord(courier)
      || !isNumber(courier.id)
      || !isNumber(courier.latitude)
      || !isNumber(courier.longitude)
      || typeof courier.status !== 'string'
    ) {
      throw new Error(`Courier at index ${courierIndex} is invalid in the initial city configuration.`);
    }
  }

  for (const [customerIndex, customer] of value.customers.entries()) {
    if (
      !isRecord(customer)
      || !isNumber(customer.id)
      || typeof customer.name !== 'string'
      || !isRecord(customer.deliveryAddress)
      || !isNumber(customer.deliveryAddress.latitude)
      || !isNumber(customer.deliveryAddress.longitude)
    ) {
      throw new Error(`Customer at index ${customerIndex} is invalid in the initial city configuration.`);
    }
  }
}

export class RestaurantService {
  private restaurants: Restaurant[] | null = null;

  public async loadRestaurants(): Promise<Restaurant[]> {
    const configurationUrl = new URL('../../../config/sugardash.initial-city.json', import.meta.url);
    const configurationText = await readFile(configurationUrl, 'utf8');

    let parsedConfiguration: unknown;
    try {
      parsedConfiguration = JSON.parse(configurationText);
    } catch (error) {
      throw new Error('Failed to parse the SugarDash initial city configuration.', { cause: error });
    }

    assertInitialCityConfiguration(parsedConfiguration);

    const restaurants = parsedConfiguration.restaurants.map(
      (restaurant) => new Restaurant(
        restaurant.restaurantId,
        restaurant.restaurantName,
        restaurant.status,
        restaurant.latitude,
        restaurant.longitude,
        new Menu(restaurant.menu.items.map(
          (item) => new MenuItem(item.itemId, item.itemName, item.price, item.status)
        ))
      )
    );

    this.restaurants = restaurants;
    return this.getRestaurants();
  }

  public getRestaurants(): Restaurant[] {
    if (this.restaurants === null) {
      throw new Error('Restaurants have not been loaded. Call loadRestaurants() first.');
    }

    return [...this.restaurants];
  }

  public getRestaurantById(id: number): Restaurant | undefined {
    if (this.restaurants === null) {
      throw new Error('Restaurants have not been loaded. Call loadRestaurants() first.');
    }

    return this.restaurants.find((restaurant) => restaurant.restaurantId === id);
  }
}
