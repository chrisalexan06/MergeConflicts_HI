import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { Menu } from '../../domain/ORD/Menu.js';
import { MenuItem } from '../../domain/ORD/MenuItem.js';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import { Restaurant } from '../../domain/ORD/Restaurant.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import { MenuService } from './MenuService.js';
import { RestaurantService } from './RestaurantService.js';

describe('R-ORD-01 restaurant and menu loading', () => {
  const restaurantService = new RestaurantService();
  let restaurants: Restaurant[];
  let menuService: MenuService;

  before(async () => {
    restaurants = await restaurantService.loadRestaurants();
    menuService = new MenuService(restaurantService);
  });

  it('loads both sample restaurants from the initial-city configuration', () => {
    assert.equal(restaurants.length, 2);
    assert.deepEqual(
      restaurants.map((restaurant) => restaurant.restaurantName),
      ['Sugar Dash Patisserie', 'Old Port Dessert Atelier']
    );
  });

  it('loads an open restaurant and a paused restaurant', () => {
    assert.ok(restaurants.some((restaurant) => restaurant.status === RestaurantStatus.OPEN));
    assert.ok(restaurants.some((restaurant) => restaurant.status === RestaurantStatus.PAUSED));
  });

  it('loads menus and menu items as ORD domain objects', () => {
    for (const restaurant of restaurants) {
      assert.ok(restaurant.menu instanceof Menu);
      assert.ok(restaurant.menu.items.length > 0);
      assert.ok(restaurant.menu.items.every((item) => item instanceof MenuItem));
    }
  });

  it('loads the sold-out sample item with SOLD_OUT status', () => {
    const soldOutItems = restaurants.flatMap((restaurant) => restaurant.menu.items)
      .filter((item) => item.status === MenuItemStatus.SOLD_OUT);

    assert.equal(soldOutItems.length, 1);
    assert.equal(soldOutItems[0].itemId, 102);
    assert.equal(soldOutItems[0].itemName, 'Chocolate Eclair');
  });

  it('retrieves the expected restaurant by ID', () => {
    const restaurant = restaurantService.getRestaurantById(1);

    assert.ok(restaurant);
    assert.equal(restaurant.restaurantName, 'Sugar Dash Patisserie');
    assert.equal(restaurant.status, RestaurantStatus.OPEN);
  });

  it('retrieves a restaurant menu and menu item through MenuService', () => {
    const menu = menuService.getMenuForRestaurant(1);
    const item = menuService.getMenuItemById(1, 102);

    assert.ok(menu);
    assert.equal(menu.items.length, 3);
    assert.ok(item);
    assert.equal(item.itemName, 'Chocolate Eclair');
    assert.equal(item.price, 5.75);
    assert.equal(item.status, MenuItemStatus.SOLD_OUT);
  });
});
