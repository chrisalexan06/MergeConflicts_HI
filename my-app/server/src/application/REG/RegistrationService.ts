import { pool } from '../../db.js';
import {
  Account,
  CustomerAccount,
  RestaurantStaffAccount,
  CourierAccount,
  OperatorAccount
} from '../../domain/REG/Account.js';
import { Role } from '../../domain/REG/Role.js';

export class RegistrationService {
  constructor() {}

  public async registerAccount(
    accountName: string,
    password: string,
    email: string,
    role: Role,
    extraData?: {
      restaurantID?: number;
      deliveryAddress?: string;
      city?: string;
      country?: string;
    }
  ): Promise<Account> {
    this.validateRequiredFields(accountName, password, email, role);

    const isDuplicate = await this.isUsernameDuplicate(accountName);
    if (isDuplicate) {
      throw new Error(`Username '${accountName}' is already taken.`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertAccountQuery = `
        INSERT INTO public."Account" ("accountName", "password", "email", "role")
        VALUES ($1, $2, $3, $4)
        RETURNING "accountID";
      `;
      const accountResult = await client.query(insertAccountQuery, [
        accountName.trim(),
        password,
        email.trim().toLowerCase(),
        role
      ]);
      const accountID = Number(accountResult.rows[0].accountID);

      let createdAccount: Account;

      switch (role) {
        case Role.CUSTOMER: {
          const address = extraData?.deliveryAddress || '123 Main St';
          const city = extraData?.city || 'Montreal';
          const country = extraData?.country || 'Canada';

          await client.query(
            `INSERT INTO public."Customer" ("accountID", "deliveryAddress", "city", "country")
             VALUES ($1, $2, $3, $4);`,
            [accountID, address, city, country]
          );
          createdAccount = new CustomerAccount(accountID, accountName, password, email, address, city, country);
          break;
        }

        case Role.RESTAURANT: {
          let restoID = extraData?.restaurantID;
          if (!restoID) {
            const defaultResto = await client.query('SELECT "restaurantID" FROM public."Restaurant" LIMIT 1;');
            restoID = defaultResto.rows.length > 0 ? Number(defaultResto.rows[0].restaurantID) : 1;
          }

          await client.query(
            `INSERT INTO public."RestaurantStaff" ("accountID", "restaurantID")
             VALUES ($1, $2);`,
            [accountID, restoID]
          );
          createdAccount = new RestaurantStaffAccount(accountID, accountName, password, email, restoID);
          break;
        }

        case Role.COURIER: {
          await client.query(
            `INSERT INTO public."Courier" ("accountID", "courierPosition", "courierStatus")
             VALUES ($1, $2, $3);`,
            [accountID, '45.5017,-73.5673', 'idle']
          );
          createdAccount = new CourierAccount(accountID, accountName, password, email);
          break;
        }

        case Role.OPERATOR: {
          await client.query(
            `INSERT INTO public."Operator" ("accountID")
             VALUES ($1);`,
            [accountID]
          );
          createdAccount = new OperatorAccount(accountID, accountName, password, email);
          break;
        }

        default:
          throw new Error(`Unsupported role: ${role}`);
      }

      await client.query('COMMIT');
      return createdAccount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async isUsernameDuplicate(accountName: string): Promise<boolean> {
    const query = 'SELECT 1 FROM public."Account" WHERE LOWER("accountName") = LOWER($1) LIMIT 1;';
    const result = await pool.query(query, [accountName.trim()]);
    return result.rows.length > 0;
  }

  public validateRequiredFields(accountName: string, password: string, email: string, role: string): void {
    if (!accountName || accountName.trim().length === 0) {
      throw new Error('Username is required.');
    }
    if (!password || password.trim().length === 0) {
      throw new Error('Password is required.');
    }
    if (!email || email.trim().length === 0) {
      throw new Error('Email is required.');
    }
    if (!role || !Object.values(Role).includes(role as Role)) {
      throw new Error(`Valid role is required. Options: ${Object.values(Role).join(', ')}`);
    }
  }

  public async findAccountById(accountID: number): Promise<Account | null> {
    const query = 'SELECT * FROM public."Account" WHERE "accountID" = $1 LIMIT 1;';
    const result = await pool.query(query, [accountID]);
    if (result.rows.length === 0) return null;
    return this.mapRowToDomain(result.rows[0]);
  }

  public async findAccountByName(accountName: string): Promise<Account | null> {
    const query = 'SELECT * FROM public."Account" WHERE LOWER("accountName") = LOWER($1) LIMIT 1;';
    const result = await pool.query(query, [accountName.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToDomain(result.rows[0]);
  }

  private mapRowToDomain(row: any): Account {
    const id = Number(row.accountID);
    switch (row.role) {
      case Role.CUSTOMER:
        return new CustomerAccount(id, row.accountName, row.password, row.email);
      case Role.RESTAURANT:
        return new RestaurantStaffAccount(id, row.accountName, row.password, row.email);
      case Role.COURIER:
        return new CourierAccount(id, row.accountName, row.password, row.email);
      case Role.OPERATOR:
        return new OperatorAccount(id, row.accountName, row.password, row.email);
      default:
        throw new Error(`Unknown role in DB: ${row.role}`);
    }
  }
}