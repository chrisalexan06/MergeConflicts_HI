import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { loadInitialCityConfiguration } from '../application/ORD/InitialCityConfiguration.js';

async function synchronizeRestaurantData(
  client: PoolClient,
  restaurants: Awaited<ReturnType<typeof loadInitialCityConfiguration>>['restaurants']
): Promise<void> {
  for (const restaurant of restaurants) {
    const position = `${restaurant.latitude},${restaurant.longitude}`;
    await client.query(
      `INSERT INTO public."Restaurant"
         ("restaurantID", "restaurantName", "restaurantPosition", "restaurantStatus")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("restaurantID") DO UPDATE
       SET "restaurantName" = EXCLUDED."restaurantName",
           "restaurantPosition" = EXCLUDED."restaurantPosition",
           "restaurantStatus" = EXCLUDED."restaurantStatus";`,
      [restaurant.restaurantId, restaurant.restaurantName, position, restaurant.status]
    );

    const menus = await client.query(
      `SELECT "menuID"
       FROM public."Menu"
       WHERE "restoID" = $1
       ORDER BY "menuID"
       FOR UPDATE;`,
      [restaurant.restaurantId]
    );

    let menuId: number;
    if (menus.rows.length === 0) {
      const insertedMenu = await client.query(
        `INSERT INTO public."Menu" ("restoID")
         VALUES ($1)
         RETURNING "menuID";`,
        [restaurant.restaurantId]
      );
      menuId = Number(insertedMenu.rows[0].menuID);
    } else {
      menuId = Number(menus.rows[0].menuID);
      const duplicateMenuIds = menus.rows.slice(1).map((row) => Number(row.menuID));

      if (duplicateMenuIds.length > 0) {
        await client.query(
          `UPDATE public."MenuItems"
           SET "menuID" = $1
           WHERE "menuID" = ANY($2::bigint[]);`,
          [menuId, duplicateMenuIds]
        );
        await client.query(
          `DELETE FROM public."Menu"
           WHERE "menuID" = ANY($1::bigint[]);`,
          [duplicateMenuIds]
        );
      }
    }

    for (const item of restaurant.menu.items) {
      await client.query(
        `INSERT INTO public."MenuItems"
           ("itemID", "itemName", "itemPrice", "itemStatus", "menuID")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("itemID") DO UPDATE
         SET "itemName" = EXCLUDED."itemName",
             "itemPrice" = EXCLUDED."itemPrice",
             "itemStatus" = EXCLUDED."itemStatus",
             "menuID" = EXCLUDED."menuID";`,
        [item.itemId, item.itemName, item.price, item.status, menuId]
      );
    }

    const itemIds = restaurant.menu.items.map((item) => item.itemId);
    await client.query(
      `DELETE FROM public."MenuItems"
       WHERE "menuID" = $1
         AND NOT ("itemID" = ANY($2::bigint[]));`,
      [menuId, itemIds]
    );
  }

  if (restaurants.length === 0) {
    throw new Error('Initial city configuration must contain at least one restaurant.');
  }

  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('public."Restaurant"', 'restaurantID')::regclass,
       GREATEST((SELECT COALESCE(MAX("restaurantID"), 1) FROM public."Restaurant"), 1),
       true
     )
     WHERE pg_get_serial_sequence('public."Restaurant"', 'restaurantID') IS NOT NULL;`
  );
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('public."MenuItems"', 'itemID')::regclass,
       GREATEST((SELECT COALESCE(MAX("itemID"), 1) FROM public."MenuItems"), 1),
       true
     )
     WHERE pg_get_serial_sequence('public."MenuItems"', 'itemID') IS NOT NULL;`
  );
}

export class InitialCitySeeder {
  public static async seed(): Promise<void> {
    const configuration = await loadInitialCityConfiguration();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await synchronizeRestaurantData(client, configuration.restaurants);
      await client.query('COMMIT');
      console.log('[InitialCitySeeder] Initial city restaurants and menus synchronized.');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Initial city transaction failed and could not be rolled back.'
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
