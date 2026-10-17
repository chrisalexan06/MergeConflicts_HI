import { MenuItem } from './MenuItem.js';

export class Menu {
  public items: MenuItem[];

  constructor(items: MenuItem[]) {
    this.items = items;
  }
}
