import type { Menu } from '../../domain/ORD/Menu.js';
import type { MenuItem } from '../../domain/ORD/MenuItem.js';
import { RestaurantService } from './RestaurantService.js';

export class MenuService {
  constructor(private readonly restaurantService: RestaurantService) {}

  public getMenuForRestaurant(restaurantId: number): Menu | undefined {
    return this.restaurantService.getRestaurantById(restaurantId)?.menu;
  }

  public getMenuItemById(restaurantId: number, itemId: number): MenuItem | undefined {
    return this.getMenuForRestaurant(restaurantId)?.items.find((item) => item.itemId === itemId);
  }
}
