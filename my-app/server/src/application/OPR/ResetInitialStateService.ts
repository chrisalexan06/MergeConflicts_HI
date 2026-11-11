import type { Pool, PoolClient } from 'pg';
import { loadInitialCityConfiguration } from '../ORD/InitialCityConfiguration.js';
import { SeedAccountLoader } from '../REG/SeedAccountLoader.js';
import { InitialCitySeeder } from '../../seed/InitialCitySeeder.js';

const resetTables = [
  'public."Account"',
  'public."Customer"',
  'public."Courier"',
  'public."Operator"',
  'public."RestaurantStaff"',
  'public."Restaurant"',
  'public."Menu"',
  'public."MenuItems"',
  'public.orders',
  'public."OrderLine"',
  'public.order_events',
  'public."OrderCharge"',
  'public.courier_assignments',
  'public.queue_entries',
  'public.ready_order_details',
  'public.order_summary_ledger',
];

export class ResetInitialStateService {
  constructor(private readonly database: Pool) {}

  async reset(): Promise<void> {
    const configuration = await loadInitialCityConfiguration();
    const client = await this.database.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(42042, 4);');
      await client.query(
        `LOCK TABLE ${resetTables.join(', ')} IN SHARE ROW EXCLUSIVE MODE;`
      );

      await this.clearOperationalState(client);
      await this.normalizeUnassignedCouriers(client);
      await InitialCitySeeder.synchronize(client, configuration);
      await SeedAccountLoader.restore(client, configuration);
      await this.restartOperationalIdentities(client);

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Initial-state reset failed and its transaction could not be rolled back.'
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async clearOperationalState(client: PoolClient): Promise<void> {
    await client.query('DELETE FROM public.order_summary_ledger;');
    await client.query('DELETE FROM public."OrderCharge";');
    await client.query('DELETE FROM public.order_events;');
    await client.query('DELETE FROM public.ready_order_details;');
    await client.query('DELETE FROM public.queue_entries;');
    await client.query('DELETE FROM public.courier_assignments;');
    await client.query('DELETE FROM public."OrderLine";');
    await client.query('DELETE FROM public.orders;');
  }

  private async normalizeUnassignedCouriers(client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE public."Courier" c
       SET "courierStatus" = 'idle'
       WHERE c."courierStatus" IN ('assigned', 'carrying')
         AND NOT EXISTS (
           SELECT 1
           FROM public.courier_assignments ca
           WHERE ca.courier_id = c."accountID"
             AND ca.unassigned_at IS NULL
         );`
    );
  }

  private async restartOperationalIdentities(client: PoolClient): Promise<void> {
    await client.query(
      'ALTER TABLE public.orders ALTER COLUMN order_id RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public."OrderLine" ALTER COLUMN "orderLineID" RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public.order_events ALTER COLUMN event_id RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public."OrderCharge" ALTER COLUMN "orderID" RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public.courier_assignments ALTER COLUMN assignment_id RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public.queue_entries ALTER COLUMN queue_entry_id RESTART WITH 1;'
    );
    await client.query(
      'ALTER TABLE public.order_summary_ledger ALTER COLUMN ledger_entry_id RESTART WITH 1;'
    );
  }
}
