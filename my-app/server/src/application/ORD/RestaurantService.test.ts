import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MenuItemStatus } from '../../domain/ORD/MenuItemStatus.js';
import { RestaurantStatus } from '../../domain/ORD/RestaurantStatus.js';
import type { DatabaseQuery } from './MenuService.js';
import { RestaurantService } from './RestaurantService.js';

interface QueryCall {
  text: string;
  values?: unknown[];
}

function createHarness(responses: Record<string, Record<string, unknown>[]> = {}) {
  const calls: QueryCall[] = [];
  const query: DatabaseQuery = async (text, values) => {
    calls.push({ text, values });
    const responseKey = text.includes('UPDATE public."Restaurant"')
      ? 'updateRestaurant'
      : text.includes('UPDATE public."MenuItems"')
        ? 'updateMenuItem'
        : text.includes('FROM public."Restaurant" r')
          ? 'staffRestaurant'
          : text.includes('SELECT mi."itemID"')
            ? 'menu'
            : 'restaurants';
    return { rows: responses[responseKey] ?? [] };
  };

  return { service: new RestaurantService(query), calls };
}

const restaurantRow = {
  restaurantID: '7',
  restaurantName: 'Cafe',
  restaurantStatus: ' OPEN ',
};

const menuRow = {
  itemID: '12',
  itemName: 'Cake',
  itemPrice: '4.50',
  itemStatus: 'available',
};

describe('RestaurantService', () => {
  it('loads restaurants and menus, normalizes database values, and supports lookups', async () => {
    const { service, calls } = createHarness({
      restaurants: [{
        ...restaurantRow,
        restaurantPosition: '45.5, -73.6',
      }],
      menu: [menuRow],
    });

    assert.throws(() => service.getRestaurants(), /have not been loaded/);
    assert.throws(() => service.getRestaurantById(7), /have not been loaded/);

    const restaurants = await service.loadRestaurants();

    assert.equal(restaurants.length, 1);
    assert.equal(restaurants[0].restaurantId, 7);
    assert.equal(restaurants[0].restaurantName, 'Cafe');
    assert.equal(restaurants[0].status, RestaurantStatus.OPEN);
    assert.equal(restaurants[0].latitude, 45.5);
    assert.equal(restaurants[0].longitude, -73.6);
    assert.deepEqual(restaurants[0].menu.items.map(({ itemId, itemName, price, status }) => ({
      itemId, itemName, price, status,
    })), [{
      itemId: 12,
      itemName: 'Cake',
      price: 4.5,
      status: MenuItemStatus.AVAILABLE,
    }]);
    assert.equal(service.getRestaurantById(7), restaurants[0]);
    assert.equal(service.getRestaurantById(8), undefined);
    assert.notEqual(service.getRestaurants(), restaurants);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].values, [7]);
  });

  it('rejects invalid restaurant data returned by the database', async () => {
    const { service } = createHarness({
      restaurants: [{
        ...restaurantRow,
        restaurantPosition: '95, -73',
      }],
    });

    await assert.rejects(() => service.loadRestaurants(), /Invalid restaurantPosition coordinates/);
  });

  it('returns a staff restaurant summary with menu items, or null when none is assigned', async () => {
    const { service, calls } = createHarness({
      staffRestaurant: [restaurantRow],
      menu: [menuRow],
    });

    const summary = await service.getRestaurantForStaff('staff-1');
    assert.deepEqual({
      restaurantId: summary?.restaurantId,
      restaurantName: summary?.restaurantName,
      status: summary?.status,
      menuItems: summary?.menuItems.map(({ itemId, itemName, price, status }) => ({
        itemId, itemName, price, status,
      })),
    }, {
      restaurantId: 7,
      restaurantName: 'Cafe',
      status: RestaurantStatus.OPEN,
      menuItems: [{
        itemId: 12,
        itemName: 'Cake',
        price: 4.5,
        status: MenuItemStatus.AVAILABLE,
      }],
    });
    assert.deepEqual(calls[0].values, ['staff-1']);
    assert.deepEqual(calls[1].values, [7]);

    const unassigned = createHarness();
    assert.equal(await unassigned.service.getRestaurantForStaff('staff-2'), null);
    assert.equal(unassigned.calls.length, 1);
  });

  it('updates status by restaurant ID and returns the updated summary', async () => {
    const { service, calls } = createHarness({
      updateRestaurant: [{
        restaurantID: '7',
        restaurantName: 'Cafe',
        restaurantStatus: 'closed',
      }],
      menu: [menuRow],
    });

    const summary = await service.setRestaurantStatus(7, RestaurantStatus.CLOSED);

    assert.equal(summary?.restaurantId, 7);
    assert.equal(summary?.status, RestaurantStatus.CLOSED);
    assert.equal(summary?.menuItems.length, 1);
    assert.match(calls[0].text, /r\."restaurantID" = \$2/);
    assert.deepEqual(calls[0].values, [RestaurantStatus.CLOSED, 7]);
    assert.deepEqual(calls[1].values, [7]);
  });

  it('pauses the staff restaurant using the account scope', async () => {
    const { service, calls } = createHarness({
      updateRestaurant: [{
        restaurantID: '7',
        restaurantName: 'Cafe',
        restaurantStatus: 'paused',
      }],
      menu: [menuRow],
    });

    const summary = await service.pauseRestaurantForStaff('staff-1');

    assert.equal(summary?.status, RestaurantStatus.PAUSED);
    assert.deepEqual(calls[0].values, [RestaurantStatus.PAUSED, 'staff-1']);
    assert.match(calls[0].text, /rs\."accountID" = \$2/);
  });

  it('returns null when a status update does not match a restaurant', async () => {
    const { service } = createHarness();

    assert.equal(await service.setRestaurantStatus(404, RestaurantStatus.CLOSED), null);
  });

  it('updates menu-item status and details for staff', async () => {
    const { service, calls } = createHarness({
      updateMenuItem: [menuRow],
    });

    const statusItem = await service.updateMenuItemStatusForStaff(
      'staff-1',
      12,
      MenuItemStatus.AVAILABLE
    );
    assert.equal(statusItem?.itemId, 12);
    assert.equal(statusItem?.status, MenuItemStatus.AVAILABLE);
    assert.deepEqual(calls[0].values, ['staff-1', 12, MenuItemStatus.AVAILABLE]);

    const detailsItem = await service.updateMenuItemDetailsForStaff('staff-1', 12, 'Cake', 4.5);
    assert.equal(detailsItem?.price, 4.5);
    assert.deepEqual(calls[1].values, ['staff-1', 12, 'Cake', 4.5]);
  });

  it('returns null when a staff menu-item update matches no item', async () => {
    const { service } = createHarness();

    assert.equal(
      await service.updateMenuItemStatusForStaff('staff-1', 404, MenuItemStatus.SOLD_OUT),
      null
    );
    assert.equal(
      await service.updateMenuItemDetailsForStaff('staff-1', 404, 'Cake', 4.5),
      null
    );
  });
});
