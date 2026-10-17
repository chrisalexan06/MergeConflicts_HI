import { MenuItemStatus } from './MenuItemStatus.js';

export class MenuItem {
  public readonly itemId: number;
  public itemName: string;
  public price: number;
  public status: MenuItemStatus;

  constructor(itemId: number, itemName: string, price: number, status: MenuItemStatus) {
    this.itemId = itemId;
    this.itemName = itemName;
    this.price = price;
    this.status = status;
  }
}
