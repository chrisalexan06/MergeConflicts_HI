import { pool } from '../../db.js';

export class SeedAccountLoader {
  public static async load(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure at least one restaurant exists for RestaurantStaff foreign key constraint
      const checkResto = await client.query('SELECT "restaurantID" FROM public."Restaurant" LIMIT 1;');
      let restoID: number;
      if (checkResto.rows.length === 0) {
        const createResto = await client.query(`
          INSERT INTO public."Restaurant" ("restaurantName", "restaurantPosition", "restaurantStatus")
          VALUES ('Chez Montreal', '45.5017,-73.5673', 'open')
          RETURNING "restaurantID";
        `);
        restoID = Number(createResto.rows[0].restaurantID);
      } else {
        restoID = Number(checkResto.rows[0].restaurantID);
      }

      const seedUsers = [
        { name: 'seed_customer', pass: 'pass123', email: 'cust@montreal.com', role: 'customer' },
        { name: 'seed_staff', pass: 'pass123', email: 'staff@montreal.com', role: 'restaurant' },
        { name: 'seed_courier', pass: 'pass123', email: 'courier@montreal.com', role: 'courier' },
        { name: 'seed_operator', pass: 'pass123', email: 'op@montreal.com', role: 'operator' },
      ];

      for (const u of seedUsers) {
        const existing = await client.query(
          'SELECT "accountID" FROM public."Account" WHERE "accountName" = $1 LIMIT 1;',
          [u.name]
        );

        let accID: number;
        if (existing.rows.length === 0) {
          const accRes = await client.query(
            `INSERT INTO public."Account" ("accountName", "password", "email", "role")
             VALUES ($1, $2, $3, $4) RETURNING "accountID";`,
            [u.name, u.pass, u.email, u.role]
          );
          accID = Number(accRes.rows[0].accountID);

          if (u.role === 'customer') {
            await client.query(
              `INSERT INTO public."Customer" ("accountID", "deliveryAddress", "city", "country")
               VALUES ($1, '1455 De Maisonneuve Blvd W', 'Montreal', 'Canada') ON CONFLICT DO NOTHING;`,
              [accID]
            );
          } else if (u.role === 'restaurant') {
            await client.query(
              `INSERT INTO public."RestaurantStaff" ("accountID", "restaurantID")
               VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
              [accID, restoID]
            );
          } else if (u.role === 'courier') {
            await client.query(
              `INSERT INTO public."Courier" ("accountID", "courierPosition", "courierStatus")
               VALUES ($1, '45.4972,-73.5790', 'idle') ON CONFLICT DO NOTHING;`,
              [accID]
            );
          } else if (u.role === 'operator') {
            await client.query(
              `INSERT INTO public."Operator" ("accountID")
               VALUES ($1) ON CONFLICT DO NOTHING;`,
              [accID]
            );
          }
        }
      }

      await client.query('COMMIT');
      console.log('[SeedAccountLoader] Seeded accounts verified in database.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[SeedAccountLoader] Error seeding accounts:', err);
    } finally {
      client.release();
    }
  }
}