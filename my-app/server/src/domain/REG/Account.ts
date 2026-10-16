import { Role } from './Role.js';

export abstract class Account {
  public readonly accountID: number;
  public accountName: string;
  public password: string;
  public email: string;
  public readonly role: Role;

  constructor(accountID: number, accountName: string, password: string, email: string, role: Role) {
    if (!accountName || !password || !email || !role) {
      throw new Error('All account fields (accountName, password, email, role) are required.');
    }
    this.accountID = accountID;
    this.accountName = accountName;
    this.password = password;
    this.email = email;
    this.role = role;
  }
}

export class CustomerAccount extends Account {
  public deliveryAddress: string;
  public city: string;
  public country: string;
  public latitude?: number;
  public longitude?: number;

  constructor(
    accountID: number,
    accountName: string,
    password: string,
    email: string,
    deliveryAddress = 'Montreal Default St',
    city = 'Montreal',
    country = 'Canada',
    latitude?: number,
    longitude?: number
  ) {
    super(accountID, accountName, password, email, Role.CUSTOMER);
    this.deliveryAddress = deliveryAddress;
    this.city = city;
    this.country = country;
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

export class RestaurantStaffAccount extends Account {
  public restaurantID: number;

  constructor(accountID: number, accountName: string, password: string, email: string, restaurantID = 1) {
    super(accountID, accountName, password, email, Role.RESTAURANT);
    this.restaurantID = restaurantID;
  }
}

export class CourierAccount extends Account {
  public courierPosition: string;
  public courierStatus: string;

  constructor(accountID: number, accountName: string, password: string, email: string, courierPosition = '45.5017,-73.5673', courierStatus = 'idle') {
    super(accountID, accountName, password, email, Role.COURIER);
    this.courierPosition = courierPosition;
    this.courierStatus = courierStatus;
  }
}

export class OperatorAccount extends Account {
  constructor(accountID: number, accountName: string, password: string, email: string) {
    super(accountID, accountName, password, email, Role.OPERATOR);
  }
}