import { Role } from './Role.js';

export abstract class Account {
  public readonly id: string;
  public username: string;
  public passwordHash: string;
  public readonly role: Role;

  constructor(id: string, username: string, passwordHash: string, role: Role) {
    if (!id || !username || !passwordHash || !role) {
      throw new Error('All account fields are required.');
    }
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.role = role;
  }
}

export class Customer extends Account {
  constructor(id: string, username: string, passwordHash: string) {
    super(id, username, passwordHash, Role.CUSTOMER);
  }
}

export class RestaurantStaff extends Account {
  constructor(id: string, username: string, passwordHash: string) {
    super(id, username, passwordHash, Role.RESTAURANT);
  }
}

export class Courier extends Account {
  constructor(id: string, username: string, passwordHash: string) {
    super(id, username, passwordHash, Role.COURIER);
  }
}

export class Operator extends Account {
  constructor(id: string, username: string, passwordHash: string) {
    super(id, username, passwordHash, Role.OPERATOR);
  }
}