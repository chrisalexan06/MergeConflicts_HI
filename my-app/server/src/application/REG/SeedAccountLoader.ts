import { pool } from '../../db.js';

export class SeedAccountLoader {
  public static async load(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const restaurantResult = await client.query(
        'SELECT "restaurantID" FROM public."Restaurant" ORDER BY "restaurantID" LIMIT 1;'
      );
      if (restaurantResult.rows.length === 0) {
        throw new Error('Cannot seed restaurant staff account because no restaurant exists.');
      }
      const restaurantId = Number(restaurantResult.rows[0].restaurantID);

      const seedUsers = [
        { name: 'seed_customer', pass: 'pass123', email: 'cust@montreal.com', role: 'customer' },
        { name: 'seed_staff', pass: 'pass123', email: 'staff@montreal.com', role: 'restaurant' },
        { name: 'seed_courier', pass: 'pass123', email: 'courier@montreal.com', role: 'courier' },
        { name: 'seed_operator', pass: 'pass123', email: 'op@montreal.com', role: 'operator' },
      ];

      for (const user of seedUsers) {
        const existing = await client.query(
          'SELECT "accountID" FROM public."Account" WHERE "accountName" = $1 LIMIT 1;',
          [user.name]
        );

        if (existing.rows.length > 0) {
          continue;
        }

        const accountResult = await client.query(
          `INSERT INTO public."Account" ("accountName", "password", "email", "role")
           VALUES ($1, $2, $3, $4)
           RETURNING "accountID";`,
          [user.name, user.pass, user.email, user.role]
        );
        const accountId = Number(accountResult.rows[0].accountID);

        if (user.role === 'customer') {
          await client.query(
            `INSERT INTO public."Customer" ("accountID", "deliveryAddress", "city", "country")
             VALUES ($1, '1455 De Maisonneuve Blvd W', 'Montreal', 'Canada')
             ON CONFLICT DO NOTHING;`,
            [accountId]
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
             VALUES ($1, '45.4972,-73.5790', 'idle')
             ON CONFLICT DO NOTHING;`,
            [accountId]
          );
        } else if (user.role === 'operator') {
          await client.query(
            `INSERT INTO public."Operator" ("accountID")
             VALUES ($1)
             ON CONFLICT DO NOTHING;`,
            [accountId]
          );
        }
      }

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
}
