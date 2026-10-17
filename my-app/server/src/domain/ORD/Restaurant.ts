import { Menu } from './Menu.js';
import { RestaurantStatus } from './RestaurantStatus.js';

export class Restaurant {
  public readonly restaurantId: number;
  public restaurantName: string;
  public status: RestaurantStatus;
  public latitude: number;
  public longitude: number;
  public menu: Menu;

  constructor(
    restaurantId: number,
    restaurantName: string,
    status: RestaurantStatus,
    latitude: number,
    longitude: number,
    menu: Menu
  ) {
    this.restaurantId = restaurantId;
    this.restaurantName = restaurantName;
    this.status = status;
    this.latitude = latitude;
    this.longitude = longitude;
    this.menu = menu;
  }
}
