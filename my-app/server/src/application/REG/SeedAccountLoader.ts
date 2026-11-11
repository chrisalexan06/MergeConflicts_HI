import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import type { InitialCityConfiguration } from '../ORD/InitialCityConfiguration.js';

const seedUsers = [
  { name: 'seed_customer', pass: 'pass123', email: 'cust@montreal.com', role: 'customer' },
  { name: 'seed_staff', pass: 'pass123', email: 'staff@montreal.com', role: 'restaurant' },
  { name: 'seed_courier', pass: 'pass123', email: 'courier@montreal.com', role: 'courier' },
  { name: 'seed_operator', pass: 'pass123', email: 'op@montreal.com', role: 'operator' },
] as const;

const seedCustomerAddress = '1455 De Maisonneuve Blvd W';
const seedCustomerCity = 'Montreal';
const seedCustomerCountry = 'Canada';
const seedCourierPosition = '45.4972,-73.5790';

export class SeedAccountLoader {
  public static async load(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.loadMissingAccounts(client);
      await client.query('COMMIT');
      console.log('[SeedAccountLoader] Seed accounts verified in database.');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Account seed transaction failed and could not be rolled back.'
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  public static async restore(
    client: PoolClient,
    configuration: InitialCityConfiguration
  ): Promise<void> {
    if (configuration.customers.length !== 1 || configuration.couriers.length !== 1) {
      throw new Error(
        'Initial-state restoration requires exactly one configured seeded customer and courier.'
      );
    }
    const restaurantId = configuration.restaurants[0]?.restaurantId;
    if (restaurantId === undefined) {
      throw new Error('Cannot restore restaurant staff because no configured restaurant exists.');
    }

    const accountIds = new Map<string, number>();
    for (const user of seedUsers) {
      const existing = await client.query<{ accountID: string | number }>(
        'SELECT "accountID" FROM public."Account" WHERE "accountName" = $1 LIMIT 1 FOR UPDATE;',
        [user.name]
      );

      if (existing.rows.length > 0) {
        const accountId = Number(existing.rows[0].accountID);
        await client.query(
          `UPDATE public."Account"
           SET "password" = $2, "email" = $3, "role" = $4
           WHERE "accountID" = $1;`,
          [accountId, user.pass, user.email, user.role]
        );
        accountIds.set(user.name, accountId);
        continue;
      }

      const account = await client.query<{ accountID: string | number }>(
        `INSERT INTO public."Account" ("accountName", "password", "email", "role")
         VALUES ($1, $2, $3, $4)
         RETURNING "accountID";`,
        [user.name, user.pass, user.email, user.role]
      );
      accountIds.set(user.name, Number(account.rows[0].accountID));
    }

    const seededAccountIds = [...accountIds.values()];
    await client.query('DELETE FROM public."Customer" WHERE "accountID" = ANY($1::bigint[]);', [seededAccountIds]);
    await client.query('DELETE FROM public."Courier" WHERE "accountID" = ANY($1::bigint[]);', [seededAccountIds]);
    await client.query('DELETE FROM public."RestaurantStaff" WHERE "accountID" = ANY($1::bigint[]);', [seededAccountIds]);
    await client.query('DELETE FROM public."Operator" WHERE "accountID" = ANY($1::bigint[]);', [seededAccountIds]);

    await client.query(
      `INSERT INTO public."Customer"
         ("accountID", "deliveryAddress", city, country, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        accountIds.get('seed_customer'),
        seedCustomerAddress,
        seedCustomerCity,
        seedCustomerCountry,
        configuration.customers[0].deliveryAddress.latitude,
        configuration.customers[0].deliveryAddress.longitude,
      ]
    );
    await client.query(
      `INSERT INTO public."RestaurantStaff" ("accountID", "restaurantID")
       VALUES ($1, $2);`,
      [accountIds.get('seed_staff'), restaurantId]
    );

    const courier = configuration.couriers[0];
    await client.query(
      `INSERT INTO public."Courier" ("accountID", "courierPosition", "courierStatus")
       VALUES ($1, $2, $3);`,
      [accountIds.get('seed_courier'), `${courier.latitude},${courier.longitude}`, courier.status]
    );
    await client.query(
      'INSERT INTO public."Operator" ("accountID") VALUES ($1);',
      [accountIds.get('seed_operator')]
    );
  }

  private static async loadMissingAccounts(client: PoolClient): Promise<void> {
    const restaurantResult = await client.query(
      'SELECT "restaurantID" FROM public."Restaurant" ORDER BY "restaurantID" LIMIT 1;'
    );
    if (restaurantResult.rows.length === 0) {
      throw new Error('Cannot seed restaurant staff account because no restaurant exists.');
    }
    const restaurantId = Number(restaurantResult.rows[0].restaurantID);

    for (const user of seedUsers) {
      const existing = await client.query(
        'SELECT "accountID" FROM public."Account" WHERE "accountName" = $1 LIMIT 1;',
        [user.name]
      );
      if (existing.rows.length > 0) continue;

      const accountResult = await client.query<{ accountID: string | number }>(
        `INSERT INTO public."Account" ("accountName", "password", "email", "role")
         VALUES ($1, $2, $3, $4)
         RETURNING "accountID";`,
        [user.name, user.pass, user.email, user.role]
      );
      const accountId = Number(accountResult.rows[0].accountID);

      if (user.role === 'customer') {
        await client.query(
          `INSERT INTO public."Customer" ("accountID", "deliveryAddress", city, country)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING;`,
          [accountId, seedCustomerAddress, seedCustomerCity, seedCustomerCountry]
        );
      } else if (user.role === 'restaurant') {
        await client.query(
          `INSERT INTO public."RestaurantStaff" ("accountID", "restaurantID")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING;`,
          [accountId, restaurantId]
        );
      } else if (user.role === 'courier') {
        await client.query(
          `INSERT INTO public."Courier" ("accountID", "courierPosition", "courierStatus")
           VALUES ($1, $2, 'idle')
           ON CONFLICT DO NOTHING;`,
          [accountId, seedCourierPosition]
        );
      } else {
        await client.query(
          `INSERT INTO public."Operator" ("accountID")
           VALUES ($1)
           ON CONFLICT DO NOTHING;`,
          [accountId]
        );
      }
    }
  }
}
