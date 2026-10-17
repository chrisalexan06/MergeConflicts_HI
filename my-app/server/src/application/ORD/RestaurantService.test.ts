import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { Menu } from '../../domain/ORD/Menu.js';
import { MenuItem } from '../../domain/ORD/MenuItem.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import { MenuService, type DatabaseQuery } from './MenuService.js';
import { RestaurantService } from './RestaurantService.js';

const restaurantsInDatabase = [
  {
    restaurantID: '1',
    restaurantName: 'Sugar Dash Patisserie',
    restaurantPosition: '45.5017,-73.5673',
    restaurantStatus: 'open',
  },
  {
    restaurantID: '2',
    restaurantName: 'Old Port Dessert Atelier',
    restaurantPosition: '45.5076,-73.5542',
    restaurantStatus: 'paused',
  },
];

const menuItemsByRestaurant: Record<number, Record<string, unknown>[]> = {
  1: [
    { itemID: '101', itemName: 'Maple Tarte', itemPrice: 6.5, itemStatus: 'available' },
    { itemID: '102', itemName: 'Chocolate Eclair', itemPrice: 5.75, itemStatus: 'sold_out' },
    { itemID: '103', itemName: 'Vanilla Macaron Box', itemPrice: 12, itemStatus: 'available' },
  ],
  2: [
    { itemID: '201', itemName: 'Strawberry Cheesecake', itemPrice: 8.25, itemStatus: 'available' },
  ],
};

const databaseQuery: DatabaseQuery = async (sql, values = []) => {
  if (sql.includes('FROM public."Restaurant"')) {
    return { rows: restaurantsInDatabase };
  }
  if (sql.includes('FROM public."Menu" m')) {
    return { rows: menuItemsByRestaurant[Number(values[0])] ?? [] };
  }
  throw new Error(`Unexpected SQL query: ${sql}`);
};

describe('R-ORD-01 restaurant and menu database mapping', () => {
  const restaurantService = new RestaurantService(databaseQuery);
  const menuService = new MenuService(databaseQuery);
  let restaurants: Restaurant[];

  before(async () => {
    restaurants = await restaurantService.loadRestaurants();
  });

  it('loads both restaurant rows from the database', () => {
    assert.equal(restaurants.length, 2);
    assert.deepEqual(
      restaurants.map((restaurant) => restaurant.restaurantName),
      ['Sugar Dash Patisserie', 'Old Port Dessert Atelier']
    );
  });

  it('converts restaurant status strings and comma-separated coordinates', () => {
    assert.equal(restaurants[0].status, RestaurantStatus.OPEN);
    assert.equal(restaurants[1].status, RestaurantStatus.PAUSED);
    assert.equal(restaurants[0].latitude, 45.5017);
    assert.equal(restaurants[0].longitude, -73.5673);
  });

  it('loads menus and menu items as ORD domain objects', () => {
    for (const restaurant of restaurants) {
      assert.ok(restaurant.menu instanceof Menu);
      assert.ok(restaurant.menu.items.length > 0);
      assert.ok(restaurant.menu.items.every((item) => item instanceof MenuItem));
    }
  });

  it('converts the sold-out menu item status', () => {
    const soldOutItem = restaurants[0].menu.items.find((item) => item.itemId === 102);

    assert.ok(soldOutItem);
    assert.equal(soldOutItem.status, MenuItemStatus.SOLD_OUT);
    assert.equal(soldOutItem.itemName, 'Chocolate Eclair');
  });

  it('retrieves a restaurant by database ID', () => {
    const restaurant = restaurantService.getRestaurantById(1);

    assert.ok(restaurant);
    assert.equal(restaurant.restaurantName, 'Sugar Dash Patisserie');
    assert.equal(restaurant.status, RestaurantStatus.OPEN);
  });

  it('queries the database for a restaurant menu and individual menu items', async () => {
    const menu = await menuService.getMenuForRestaurant(1);
    const item = await menuService.getMenuItemById(1, 102);

    assert.equal(menu.items.length, 3);
    assert.ok(item);
    assert.equal(item.itemName, 'Chocolate Eclair');
    assert.equal(item.price, 5.75);
    assert.equal(item.status, MenuItemStatus.SOLD_OUT);
  });
});
