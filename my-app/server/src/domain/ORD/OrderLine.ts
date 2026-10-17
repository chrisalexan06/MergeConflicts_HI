export class OrderLine {
  public readonly itemId: number;
  public quantity: number;

  constructor(itemId: number, quantity: number) {
    this.itemId = itemId;
    this.quantity = quantity;
  }
}
