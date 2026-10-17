import type { CustomerAccount, CourierAccount } from '../../domain/REG/Account.js';
import type { Menu } from '../../domain/ORD/Menu.js';
import type { Restaurant } from '../../domain/ORD/Restaurant.js';

export interface InitialCityCustomer {
  id: CustomerAccount['accountID'];
  name: CustomerAccount['accountName'];
  deliveryAddress: {
    latitude: NonNullable<CustomerAccount['latitude']>;
    longitude: NonNullable<CustomerAccount['longitude']>;
  };
}

export interface InitialCityCourier {
  id: CourierAccount['accountID'];
  latitude: number;
  longitude: number;
  status: CourierAccount['courierStatus'];
}

export type InitialCityRestaurant = Pick<
  Restaurant,
  'restaurantId' | 'restaurantName' | 'status' | 'latitude' | 'longitude'
> & {
  menu: Menu;
};

export interface InitialCityConfiguration {
  city: string;
  restaurants: InitialCityRestaurant[];
  couriers: InitialCityCourier[];
  customers: InitialCityCustomer[];
}
